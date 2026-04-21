from __future__ import annotations

import json
import sys
import uuid
from typing import AsyncIterator

# Force UTF-8 stdout/stderr on Windows so crawl4ai logging never crashes the process.
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graph import VeritasState, create_pipeline

app = FastAPI(title="VeritasSearch Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    max_sources: int = 10


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
async def verify_query(req: QueryRequest) -> dict:
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
async def verify_stream(req: QueryRequest) -> StreamingResponse:
    session_id = str(uuid.uuid4())

    async def event_stream() -> AsyncIterator[str]:
        pipeline, store = create_pipeline(session_id)
        try:
            yield _sse("session_start", {"session_id": session_id})

            # LangGraph native streaming — one event per node completion
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
