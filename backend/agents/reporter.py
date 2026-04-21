"""Reporter agent: deterministic answer synthesis from audit data — no LLM needed.

phi3.5 hallucinates on open-ended text generation. All data we need is already
structured in the audit result, so we build the answer directly from that.
"""
from __future__ import annotations

from typing import Any


class ReporterAgent:
    def __init__(self, model: str = "") -> None:
        pass  # no LLM client needed

    async def synthesize(self, query: str, audit_result: dict[str, Any]) -> dict[str, Any]:
        verdicts = audit_result.get("verdicts", [])
        source_count = sum(len(v["supports"]) + len(v["refutes"]) for v in verdicts)

        if source_count == 0:
            if not verdicts:
                answer = (
                    "No sources could be fetched. "
                    "Make sure SearXNG (port 8888) is running and returning results."
                )
            else:
                answer = (
                    "Sources were scraped but none were relevant to the claims. "
                    "Try a more specific query or check SearXNG engine settings."
                )
            return {
                "answer": answer,
                "short_answer": answer,
                "trust_score": 0.0,
                "has_conflicts": False,
                "verdicts": verdicts,
                "source_count": 0,
            }

        answer = _synthesize_answer(query, verdicts)
        return {
            "answer": answer,
            "short_answer": answer,
            "trust_score": audit_result.get("overall_trust", 0.0),
            "has_conflicts": audit_result.get("has_conflicts", False),
            "verdicts": verdicts,
            "source_count": source_count,
        }

    async def aclose(self) -> None:
        pass


def _cite(domains: list[str]) -> str:
    clean = [d.replace("www.", "") for d in domains]
    if not clean:
        return "multiple sources"
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f"{clean[0]} and {clean[1]}"
    return f"{clean[0]}, {clean[1]}, and {clean[2]}"


def _synthesize_answer(_query: str, verdicts: list[dict]) -> str:
    total_s = sum(len(v.get("supports", [])) for v in verdicts)
    total_r = sum(len(v.get("refutes", [])) for v in verdicts)
    total = total_s + total_r

    if total == 0:
        return "No classifiable evidence found — try a more specific query."

    consensus = total_s / total

    support_domains = list(dict.fromkeys(
        d for v in verdicts for d in v.get("supports", [])
    ))[:3]
    refute_domains = list(dict.fromkeys(
        d for v in verdicts for d in v.get("refutes", [])
    ))[:2]

    if consensus >= 0.80:
        return (
            f"YES — {_cite(support_domains)} confirm this "
            f"({total_s}/{total} sources supporting)."
        )
    elif consensus >= 0.60:
        r = f"; {_cite(refute_domains)} disagrees" if refute_domains else ""
        return (
            f"LIKELY YES — {_cite(support_domains)} support this{r} "
            f"({total_s}/{total} sources supporting)."
        )
    elif consensus >= 0.40:
        return (
            f"MIXED — {_cite(support_domains)} support this while "
            f"{_cite(refute_domains)} refute it ({total_s} vs {total_r} sources)."
        )
    else:
        s = f"; {_cite(support_domains)} partially disagrees" if support_domains else ""
        return (
            f"NO — {_cite(refute_domains)} refute this{s} "
            f"({total_r}/{total} sources opposing)."
        )
