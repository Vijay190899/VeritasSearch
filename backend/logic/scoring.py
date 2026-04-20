"""Provenance scoring: calculates S_p based on consensus, authority, and AI entropy."""
from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agents.researcher import EvidenceDocument

# Weight coefficients for the provenance score formula
W_CONSENSUS = 0.50
W_AUTHORITY = 0.30
W_ENTROPY = 0.20

AUTHORITATIVE_TLDS = {".edu", ".gov", ".org", ".ac.uk", ".ac.in"}
HIGH_AUTHORITY_DOMAINS = {
    "nature.com", "science.org", "pubmed.ncbi.nlm.nih.gov", "arxiv.org",
    "reuters.com", "apnews.com", "bbc.com", "theguardian.com", "nytimes.com",
}


class ProvenanceScorer:
    """
    S_p = W_consensus * consensus_ratio
        + W_authority * authority_score
        + W_entropy  * (1 - ai_flatness)
    """

    def calculate(
        self,
        supports: int,
        refutes: int,
        docs: list["EvidenceDocument"],
        ai_flatness: float,
    ) -> float:
        total = supports + refutes
        consensus = supports / total if total > 0 else 0.0

        authority = self._authority_score(docs)
        entropy_bonus = 1.0 - min(max(ai_flatness, 0.0), 1.0)

        score = (
            W_CONSENSUS * consensus
            + W_AUTHORITY * authority
            + W_ENTROPY * entropy_bonus
        )
        return round(min(max(score, 0.0), 1.0), 4)

    def _authority_score(self, docs: list["EvidenceDocument"]) -> float:
        if not docs:
            return 0.0
        scores = [self._domain_authority(doc.domain, doc.is_https) for doc in docs]
        return sum(scores) / len(scores)

    def _domain_authority(self, domain: str, is_https: bool) -> float:
        score = 0.3
        if is_https:
            score += 0.1
        if any(domain.endswith(tld) for tld in AUTHORITATIVE_TLDS):
            score += 0.4
        if any(auth in domain for auth in HIGH_AUTHORITY_DOMAINS):
            score += 0.5
        parts = domain.split(".")
        if len(parts) == 2:
            score += 0.1
        return min(score, 1.0)
