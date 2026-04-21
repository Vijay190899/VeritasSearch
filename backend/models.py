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

    def snippet(self, max_words: int = 800) -> str:
        """Return a word-capped content snippet for LLM prompts."""
        return " ".join(self.content.split()[:max_words])
