"""Shared domain models — imported by agents, db, and graph layers alike.

Centralising EvidenceDocument here breaks the circular TYPE_CHECKING workaround
that existed between db/vector_store.py and agents/researcher.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class EvidenceDocument:
    """A single scraped web page mapped to a specific claim."""

    url: str
    domain: str
    title: str
    content: str
    claim_id: str
    word_count: int = 0
    is_https: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.word_count = len(self.content.split())
        self.is_https = self.url.startswith("https://")

    def snippet(self, max_words: int = 800, query: str = "") -> str:
        """Return the most claim-relevant word-capped content snippet."""
        words = self.content.split()
        if not query or len(words) <= max_words:
            return " ".join(words[:max_words])
        query_terms = {w.lower().strip(".,!?;:\"'") for w in query.split() if len(w) > 3}
        step = max(1, max_words // 4)
        best_score = -1
        best_start = 0
        for start in range(0, max(1, len(words) - max_words), step):
            window = words[start : start + max_words]
            score = sum(1 for w in window if w.lower().strip(".,!?;:\"'") in query_terms)
            if score > best_score:
                best_score = score
                best_start = start
        return " ".join(words[best_start : best_start + max_words])
