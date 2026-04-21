"""Provenance scoring: S_p = consensus-first + coverage + HTTPS bonus."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import EvidenceDocument


class ProvenanceScorer:
    """
    S_p = 0.70 * consensus + 0.15 * coverage(capped at 6 sources) + 0.15 * https_ratio
    Floor: if any supports exist, score >= 0.55 + 0.03 per extra support (max 0.67).
    Simple, auditable, no LLM-dependent entropy terms.
    """

    def calculate(
        self,
        supports: int,
        refutes: int,
        docs: list["EvidenceDocument"],
        ai_flatness: float,  # noqa: ARG002 — kept for call-site compatibility
    ) -> float:
        total = supports + refutes
        if total == 0:
            return 0.0

        consensus = supports / total
        coverage = min(total / 6, 1.0)
        https_ratio = sum(1 for d in docs if d.is_https) / max(len(docs), 1)

        score = 0.70 * consensus + 0.15 * coverage + 0.15 * https_ratio

        if supports > 0:
            floor = 0.55 + min(supports - 1, 4) * 0.03
            score = max(score, floor)

        return round(min(max(score, 0.0), 1.0), 4)
