from __future__ import annotations

import asyncio
import uuid
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.planner import PlannerAgent
from agents.researcher import ResearcherAgent
from agents.auditor import AuditorAgent
from agents.reporter import ReporterAgent
from db.vector_store import VectorStore

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


class VerificationSession:
    """Holds per-request ephemeral state."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.vector_store = VectorStore(session_id)
        self.planner = PlannerAgent()
        self.researcher = ResearcherAgent(self.vector_store)
        self.auditor = AuditorAgent(self.vector_store)
        self.reporter = ReporterAgent()


@app.post("/api/verify")
async def verify_query(req: QueryRequest) -> dict:
    session_id = str(uuid.uuid4())
    session = VerificationSession(session_id)

    claims = await session.planner.decompose(req.query)
    evidence = await session.researcher.gather(claims, max_sources=req.max_sources)
    audit_result = await session.auditor.evaluate(claims, evidence)
    report = await session.reporter.synthesize(req.query, audit_result)

    session.vector_store.cleanup()
    return {"session_id": session_id, "report": report, "audit": audit_result}


@app.post("/api/verify/stream")
async def verify_stream(req: QueryRequest) -> StreamingResponse:
    session_id = str(uuid.uuid4())
    session = VerificationSession(session_id)

    async def event_stream() -> AsyncIterator[str]:
        yield f"data: {{\"event\": \"session_start\", \"session_id\": \"{session_id}\"}}\n\n"

        claims = await session.planner.decompose(req.query)
        yield f"data: {{\"event\": \"claims\", \"data\": {claims}}}\n\n"

        evidence = await session.researcher.gather(claims, max_sources=req.max_sources)
        yield f"data: {{\"event\": \"evidence_ready\", \"count\": {len(evidence)}}}\n\n"

        audit_result = await session.auditor.evaluate(claims, evidence)
        import json
        yield f"data: {{\"event\": \"audit_complete\", \"data\": {json.dumps(audit_result)}}}\n\n"

        report = await session.reporter.synthesize(req.query, audit_result)
        yield f"data: {{\"event\": \"report\", \"data\": {json.dumps(report)}}}\n\n"

        session.vector_store.cleanup()
        yield "data: {\"event\": \"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
