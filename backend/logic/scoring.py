"""Provenance scoring: calculates S_p based on consensus, authority, and AI entropy."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agents.researcher import EvidenceDocument

# Weight coefficients — consensus-heavy so partial support still scores well
W_CONSENSUS = 0.58
W_AUTHORITY = 0.25
W_ENTROPY   = 0.17

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
        # Without at least one supporting or refuting source there is no verdict —
        # authority and entropy bonuses must not inflate the score to a misleading value.
        if total == 0:
            return 0.0

        consensus = supports / total
        authority = self._authority_score(docs)
        entropy_bonus = 1.0 - min(max(ai_flatness, 0.0), 1.0)

        score = (
            W_CONSENSUS * consensus
            + W_AUTHORITY * authority
            + W_ENTROPY * entropy_bonus
        )
        # Supporting-evidence presence bonus: if any source supports the claim,
        # add a floor bonus so partial support isn't punished by low-authority domains.
        if supports > 0:
            bonus = 0.10 + min(supports - 1, 3) * 0.025  # 0.10 for 1 src, up to 0.175 for 4+
            score = min(1.0, score + bonus)
        return round(min(max(score, 0.0), 1.0), 4)

    def _authority_score(self, docs: list["EvidenceDocument"]) -> float:
        if not docs:
            return 0.0
        scores = [self._domain_authority(doc.domain, doc.is_https) for doc in docs]
        return sum(scores) / len(scores)

    def _domain_authority(self, domain: str, is_https: bool) -> float:
        score = 0.35  # raised floor — even unknown HTTPS domains have credibility
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
