"""Reporter agent: synthesizes a final answer from audit results using the local SLM."""
from __future__ import annotations

import json
from typing import Any

import httpx

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "phi3.5:latest"

REPORT_PROMPT = """\
Question: {query}
Evidence: {audit_summary}

Write ONE sentence. Start with YES, NO, or MIXED. State your verdict and name 1-2 source domains.
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
                    "options": {"num_predict": 80, "temperature": 0.1},
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "").strip()
            # Truncate any runaway output at a natural sentence boundary
            answer_text = _trim_to_sentences(raw, max_sentences=2)
        except Exception:
            answer_text = _synthesize_fallback(query, verdicts)

        import re as _re
        sentences = _re.split(r"(?<=[.!?])\s+", answer_text.strip())
        short_answer = sentences[0].strip() if sentences else answer_text

        return {
            "answer": answer_text,
            "short_answer": short_answer,
            "trust_score": audit_result.get("overall_trust", 0.0),
            "has_conflicts": audit_result.get("has_conflicts", False),
            "verdicts": verdicts,
            "source_count": source_count,
        }


def _synthesize_fallback(_query: str, verdicts: list[dict]) -> str:
    """Build a plain-language answer from audit data when the LLM is unavailable."""
    supporting = sum(len(v.get("supports", [])) for v in verdicts)
    refuting = sum(len(v.get("refutes", [])) for v in verdicts)
    total = supporting + refuting
    if total == 0:
        return (
            "Evidence was gathered but could not be classified as directly "
            "supporting or refuting the claims. Try a more specific query."
        )
    ratio = supporting / total
    if ratio >= 0.75:
        verdict_str = "YES — the majority of evidence supports this"
    elif ratio >= 0.55:
        verdict_str = "LIKELY — evidence leans toward support with some disagreement"
    elif ratio >= 0.35:
        verdict_str = "MIXED — evidence is split between supporting and refuting sources"
    else:
        verdict_str = "UNLIKELY — most evidence refutes this"
    all_supports = list(dict.fromkeys(d for v in verdicts for d in v.get("supports", [])))[:3]
    all_refutes = list(dict.fromkeys(d for v in verdicts for d in v.get("refutes", [])))[:2]
    parts = [f"{verdict_str}."]
    if all_supports:
        parts.append(f"Supporting sources include: {', '.join(all_supports)}.")
    if all_refutes:
        parts.append(f"Refuting sources include: {', '.join(all_refutes)}.")
    return " ".join(parts)


def _trim_to_sentences(text: str, max_sentences: int) -> str:
    """Keep at most max_sentences by splitting on sentence-ending punctuation."""
    import re
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:max_sentences]).strip()
