"""Reporter agent: synthesizes a final answer from audit results using the local SLM."""
from __future__ import annotations

import json
from typing import Any

import httpx

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "phi3.5:latest"

REPORT_PROMPT = """\
You are a research reporter generating an evidence-based answer. Use ONLY the verified claims below.

Original query: {query}

Verified claims (JSON):
{audit_summary}

Rules:
- If a claim is CONTROVERSIAL, explicitly state the disagreement.
- If consensus_score < 0.5, label the claim UNVERIFIABLE.
- Do NOT invent facts. Cite domain names.
- Output a concise structured answer (3-6 sentences).
"""


class ReporterAgent:
    def __init__(self, model: str = OLLAMA_MODEL) -> None:
        self.model = model
        self._client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=120.0)

    async def synthesize(self, query: str, audit_result: dict[str, Any]) -> dict[str, Any]:
        verdicts = audit_result.get("verdicts", [])
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
                json={"model": self.model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            answer_text = resp.json().get("response", "Unable to generate response.")
        except Exception as exc:
            answer_text = f"Report generation failed: {exc}"

        return {
            "answer": answer_text,
            "trust_score": audit_result.get("overall_trust", 0.0),
            "has_conflicts": audit_result.get("has_conflicts", False),
            "verdicts": verdicts,
            "source_count": sum(
                len(v["supports"]) + len(v["refutes"]) for v in verdicts
            ),
        }

    async def aclose(self) -> None:
        await self._client.aclose()
