"""LangGraph multi-agent pipeline for VeritasSearch."""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from agents.planner import PlannerAgent
from agents.researcher import ResearcherAgent
from agents.auditor import AuditorAgent
from agents.reporter import ReporterAgent
from db.vector_store import VectorStore
from models import EvidenceDocument


class VeritasState(TypedDict):
    query: str
    session_id: str
    max_sources: int
    claims: list[dict[str, Any]]
    evidence: list[EvidenceDocument]      # typed — not list[Any]
    audit_result: dict[str, Any]
    report: dict[str, Any]
    error: str | None


def build_graph(
    planner: PlannerAgent,
    researcher: ResearcherAgent,
    auditor: AuditorAgent,
    reporter: ReporterAgent,
) -> CompiledStateGraph:
    """Compile the LangGraph pipeline from pre-constructed agent instances.

    Agents are injected so callers can supply per-request VectorStore instances,
    enabling ephemeral ChromaDB isolation between requests.
    """
    graph: StateGraph = StateGraph(VeritasState)

    async def plan_node(state: VeritasState) -> dict[str, Any]:
        try:
            claims = await planner.decompose(state["query"])
            return {"claims": claims, "error": None}
        except Exception as exc:
            return {"claims": [], "error": str(exc)}

    async def research_node(state: VeritasState) -> dict[str, Any]:
        if state.get("error") or not state["claims"]:
            return {"evidence": []}
        try:
            evidence = await researcher.gather(
                state["claims"], max_sources=state.get("max_sources", 10)
            )
            return {"evidence": evidence}
        except Exception as exc:
            return {"evidence": [], "error": str(exc)}

    async def audit_node(state: VeritasState) -> dict[str, Any]:
        if state.get("error"):
            return {"audit_result": {}}
        try:
            audit_result = await auditor.evaluate(state["claims"], state["evidence"])
            return {"audit_result": audit_result}
        except Exception as exc:
            return {"audit_result": {}, "error": str(exc)}

    async def report_node(state: VeritasState) -> dict[str, Any]:
        if state.get("error"):
            return {
                "report": {"answer": f"Error: {state['error']}", "trust_score": 0.0}
            }
        try:
            report = await reporter.synthesize(state["query"], state["audit_result"])
            # Hard guard: if answer is too long OR contains non-ASCII (injection artifacts),
            # discard it and rebuild directly from audit data.
            ans = report.get("answer", "")
            if len(ans) > 300 or not ans.isascii():
                from agents.reporter import _synthesize_answer
                safe = _synthesize_answer("", state["audit_result"].get("verdicts", []))
                report["answer"] = safe
                report["short_answer"] = safe
            return {"report": report}
        except Exception as exc:
            return {"report": {"answer": f"Report error: {exc}", "trust_score": 0.0}}

    def route_after_research(state: VeritasState) -> str:
        return "audit" if state.get("evidence") else "report"

    graph.add_node("plan", plan_node)
    graph.add_node("research", research_node)
    graph.add_node("audit", audit_node)
    graph.add_node("report", report_node)

    graph.set_entry_point("plan")
    graph.add_edge("plan", "research")
    graph.add_conditional_edges(
        "research",
        route_after_research,
        {"audit": "audit", "report": "report"},
    )
    graph.add_edge("audit", "report")
    graph.add_edge("report", END)

    return graph.compile()


def create_pipeline(session_id: str) -> tuple[CompiledStateGraph, VectorStore]:
    """Factory: wire agents + ephemeral VectorStore and return (graph, store).

    Callers must call `store.cleanup()` after consuming the final state.

    Usage::

        pipeline, store = create_pipeline(session_id)
        final = await pipeline.ainvoke(initial_state)
        store.cleanup()
    """
    store = VectorStore(session_id)
    pipeline = build_graph(
        planner=PlannerAgent(),
        researcher=ResearcherAgent(store),
        auditor=AuditorAgent(store),
        reporter=ReporterAgent(),
    )
    return pipeline, store
