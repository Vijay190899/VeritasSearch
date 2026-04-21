from __future__ import annotations

import json
import sys
import time
import uuid
from collections import defaultdict
from typing import AsyncIterator

# Force UTF-8 stdout/stderr on Windows so crawl4ai logging never crashes the process.
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from graph import VeritasState, create_pipeline

app = FastAPI(title="VeritasSearch Engine", version="1.0.0")

# ── CORS: localhost only — never expose to the public internet ────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

# ── In-memory rate limiter: max 10 requests per IP per 60 seconds ─────────────
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 10
RATE_WINDOW = 60  # seconds


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    window_start = now - RATE_WINDOW
    calls = [t for t in _rate_store[ip] if t > window_start]
    calls.append(now)
    _rate_store[ip] = calls
    if len(calls) > RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 10 requests per minute.")


# ── Prompt injection detection ────────────────────────────────────────────────
_INJECTION_MARKERS = [
    "ignore previous instructions",
    "ignore all instructions",
    "you are now",
    "disregard your",
    "forget your instructions",
    "new persona",
    "system prompt",
    "<|im_start|>",
    "<|im_end|>",
    "[INST]",
    "jailbreak",
]


def _check_query(query: str) -> None:
    lower = query.lower()
    for marker in _INJECTION_MARKERS:
        if marker in lower:
            raise HTTPException(status_code=400, detail="Query contains disallowed content.")


class QueryRequest(BaseModel):
    query: str
    max_sources: int = 10

    @field_validator("query")
    @classmethod
    def query_must_be_reasonable(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Query cannot be empty.")
        if len(v) > 500:
            raise ValueError("Query too long (max 500 characters).")
        return v

    @field_validator("max_sources")
    @classmethod
    def cap_sources(cls, v: int) -> int:
        return min(max(v, 1), 15)


def _initial_state(query: str, session_id: str, max_sources: int) -> VeritasState:
    return VeritasState(
        query=query,
        session_id=session_id,
        max_sources=max_sources,
        claims=[],
        evidence=[],
        audit_result={},
        report={},
        error=None,
    )


@app.post("/api/verify")
async def verify_query(req: QueryRequest, request: Request) -> dict:
    _check_rate_limit(request.client.host if request.client else "unknown")
    _check_query(req.query)
    session_id = str(uuid.uuid4())
    pipeline, store = create_pipeline(session_id)
    try:
        final: VeritasState = await pipeline.ainvoke(
            _initial_state(req.query, session_id, req.max_sources)
        )
    finally:
        store.cleanup()
    return {
        "session_id": session_id,
        "report": final["report"],
        "audit": final["audit_result"],
    }


@app.post("/api/verify/stream")
async def verify_stream(req: QueryRequest, request: Request) -> StreamingResponse:
    _check_rate_limit(request.client.host if request.client else "unknown")
    _check_query(req.query)
    session_id = str(uuid.uuid4())

    async def event_stream() -> AsyncIterator[str]:
        pipeline, store = create_pipeline(session_id)
        try:
            yield _sse("session_start", {"session_id": session_id})

            async for event in pipeline.astream_events(
                _initial_state(req.query, session_id, req.max_sources),
                version="v2",
            ):
                kind = event.get("event")
                name = event.get("name", "")

                if kind == "on_chain_end" and name == "plan":
                    claims = event["data"]["output"].get("claims", [])
                    yield _sse("claims", {"data": claims, "count": len(claims)})

                elif kind == "on_chain_end" and name == "research":
                    evidence = event["data"]["output"].get("evidence", [])
                    yield _sse("evidence_ready", {"count": len(evidence)})

                elif kind == "on_chain_end" and name == "audit":
                    audit = event["data"]["output"].get("audit_result", {})
                    yield _sse("audit_complete", {"data": audit})

                elif kind == "on_chain_end" and name == "report":
                    report = event["data"]["output"].get("report", {})
                    yield _sse("report", {"data": report})

            yield _sse("done", {})
        finally:
            store.cleanup()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


def _sse(event: str, payload: dict) -> str:
    return f"data: {json.dumps({'event': event, **payload})}\n\n"
