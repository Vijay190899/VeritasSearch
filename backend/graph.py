"""LangGraph multi-agent pipeline for VeritasSearch."""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from agents.planner import PlannerAgent
from agents.researcher import ResearcherAgent
from agents.auditor import AuditorAgent
from agents.reporter import ReporterAgent
from db.vector_store import VectorStore


class VeritasState(TypedDict):
    query: str
    session_id: str
    max_sources: int
    claims: list[dict[str, Any]]
    evidence: list[Any]
    audit_result: dict[str, Any]
    report: dict[str, Any]
    error: str | None


def build_graph(
    planner: PlannerAgent,
    researcher: ResearcherAgent,
    auditor: AuditorAgent,
    reporter: ReporterAgent,
) -> StateGraph:
    graph = StateGraph(VeritasState)

    async def plan_node(state: VeritasState) -> VeritasState:
        try:
            claims = await planner.decompose(state["query"])
            return {**state, "claims": claims, "error": None}
        except Exception as exc:
            return {**state, "claims": [], "error": str(exc)}

    async def research_node(state: VeritasState) -> VeritasState:
        if state.get("error") or not state["claims"]:
            return state
        try:
            evidence = await researcher.gather(
                state["claims"], max_sources=state.get("max_sources", 10)
            )
            return {**state, "evidence": evidence}
        except Exception as exc:
            return {**state, "evidence": [], "error": str(exc)}

    async def audit_node(state: VeritasState) -> VeritasState:
        if state.get("error"):
            return state
        try:
            audit_result = await auditor.evaluate(state["claims"], state["evidence"])
            return {**state, "audit_result": audit_result}
        except Exception as exc:
            return {**state, "audit_result": {}, "error": str(exc)}

    async def report_node(state: VeritasState) -> VeritasState:
        if state.get("error"):
            return {
                **state,
                "report": {"answer": f"Error: {state['error']}", "trust_score": 0.0},
            }
        try:
            report = await reporter.synthesize(state["query"], state["audit_result"])
            return {**state, "report": report}
        except Exception as exc:
            return {**state, "report": {"answer": f"Report error: {exc}", "trust_score": 0.0}}

    def route_after_research(state: VeritasState) -> str:
        if not state.get("evidence"):
            return "report"
        return "audit"

    graph.add_node("plan", plan_node)
    graph.add_node("research", research_node)
    graph.add_node("audit", audit_node)
    graph.add_node("report", report_node)

    graph.set_entry_point("plan")
    graph.add_edge("plan", "research")
    graph.add_conditional_edges("research", route_after_research, {"audit": "audit", "report": "report"})
    graph.add_edge("audit", "report")
    graph.add_edge("report", END)

    return graph.compile()
