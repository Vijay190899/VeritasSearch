"""Reporter agent: synthesizes a final answer from audit results using the local SLM."""
from __future__ import annotations

import json
from typing import Any

import httpx

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "phi3.5:latest"

REPORT_PROMPT = """\
You are a fact-checking reporter. Write a clear, direct answer to the user's question using ONLY the evidence below.

Question: {query}

Evidence (JSON):
{audit_summary}

Instructions:
- Write exactly 3-5 plain sentences. No bullet points. No headers. No markdown.
- For each claim with consensus >= 0.5, state it as supported with the source domains.
- For each claim with consensus < 0.5, state the evidence is mixed or insufficient.
- If a claim is controversial (has both supports and refutes), mention the disagreement.
- Never invent facts. Never add information not in the evidence above.
- End your answer when the facts are stated. Do not add closing remarks.
"""


class ReporterAgent:
    def __init__(self, model: str = OLLAMA_MODEL) -> None:
        self.model = model
        self._client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=120.0)

    async def synthesize(self, query: str, audit_result: dict[str, Any]) -> dict[str, Any]:
        verdicts = audit_result.get("verdicts", [])
        source_count = sum(len(v["supports"]) + len(v["refutes"]) for v in verdicts)

        # Short-circuit: never call the LLM with zero evidence — it will hallucinate.
        if source_count == 0:
            if not verdicts:
                reason = (
                    "No sources could be fetched. Make sure SearXNG (port 8888) is running "
                    "and returning results for this query."
                )
            else:
                reason = (
                    "Sources were scraped but none contained text directly relevant to the claims. "
                    "Try a more specific query, or check that the SearXNG engines (Google, Bing, DuckDuckGo) "
                    "are enabled in the SearXNG settings."
                )
            return {
                "answer": f"Unable to verify: {reason}",
                "trust_score": 0.0,
                "has_conflicts": False,
                "verdicts": verdicts,
                "source_count": 0,
            }

        summary = [
            {
                "claim": v["claim_text"],
                "consensus": v["consensus_score"],
                "controversial": v["is_controversial"],
                "supports": v["supports"][:3],
                "refutes": v["refutes"][:3],
            }
            for v in verdicts
        ]

        prompt = REPORT_PROMPT.format(
            query=query,
            audit_summary=json.dumps(summary, indent=2),
        )

        try:
            resp = await self._client.post(
                "/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"num_predict": 250, "temperature": 0.2},
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "").strip()
            # Truncate any runaway output at a natural sentence boundary
            answer_text = _trim_to_sentences(raw, max_sentences=6)
        except Exception as exc:
            answer_text = f"Report generation failed: {exc}"

        return {
            "answer": answer_text,
            "trust_score": audit_result.get("overall_trust", 0.0),
            "has_conflicts": audit_result.get("has_conflicts", False),
            "verdicts": verdicts,
            "source_count": source_count,
        }


def _trim_to_sentences(text: str, max_sentences: int) -> str:
    """Keep at most max_sentences by splitting on sentence-ending punctuation."""
    import re
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:max_sentences]).strip()
