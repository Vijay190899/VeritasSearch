"""Linguistic entropy analysis to detect AI-generated 'flat' text."""
from __future__ import annotations

import math
import re
from collections import Counter


class AiFlatenessDetector:
    """
    Scores text on a 0.0–1.0 scale where 1.0 = highly likely AI-generated.

    Signals used:
    - Type-Token Ratio (low TTR → repetitive → AI-flat)
    - Sentence length variance (uniform sentences → AI pattern)
    - Filler phrase density (known AI boilerplate)
    - Perplexity-proxy via bigram entropy (low entropy → predictable)
    """

    AI_FILLER_PHRASES = [
        "in conclusion", "it is worth noting", "it's important to",
        "furthermore", "in summary", "to summarize", "needless to say",
        "as previously mentioned", "it goes without saying", "delve into",
        "it is crucial to", "navigating the", "in the realm of",
        "a testament to", "game-changer", "paradigm shift", "leverage",
        "foster innovation", "streamline", "holistic approach",
    ]

    def score(self, text: str) -> float:
        if not text or len(text.split()) < 20:
            return 0.5

        tokens = re.findall(r"\b\w+\b", text.lower())
        if not tokens:
            return 0.5

        ttr_score = self._ttr_flatness(tokens)
        variance_score = self._sentence_variance_flatness(text)
        filler_score = self._filler_density(text.lower())
        entropy_score = self._bigram_entropy_flatness(tokens)

        composite = (
            0.35 * ttr_score
            + 0.25 * variance_score
            + 0.25 * filler_score
            + 0.15 * entropy_score
        )
        return round(min(max(composite, 0.0), 1.0), 4)

    def _ttr_flatness(self, tokens: list[str]) -> float:
        ttr = len(set(tokens)) / len(tokens)
        # Human text TTR typically 0.5-0.8; AI text 0.3-0.5
        # Map: ttr < 0.35 → 1.0 (very flat), ttr > 0.65 → 0.0
        flatness = 1.0 - min(max((ttr - 0.35) / 0.30, 0.0), 1.0)
        return flatness

    def _sentence_variance_flatness(self, text: str) -> float:
        sentences = re.split(r"[.!?]+", text)
        lengths = [len(s.split()) for s in sentences if len(s.split()) > 3]
        if len(lengths) < 3:
            return 0.5
        mean = sum(lengths) / len(lengths)
        variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
        std_dev = math.sqrt(variance)
        # Low std_dev (< 5) suggests AI uniformity; high (> 15) suggests human
        flatness = 1.0 - min(max((std_dev - 3.0) / 12.0, 0.0), 1.0)
        return flatness

    def _filler_density(self, text: str) -> float:
        word_count = len(text.split())
        if word_count == 0:
            return 0.0
        hits = sum(1 for phrase in self.AI_FILLER_PHRASES if phrase in text)
        # 3+ filler phrases per 200 words = very likely AI
        density = (hits / word_count) * 200
        return min(density / 3.0, 1.0)

    def _bigram_entropy_flatness(self, tokens: list[str]) -> float:
        if len(tokens) < 4:
            return 0.5
        bigrams = list(zip(tokens, tokens[1:]))
        freq = Counter(bigrams)
        total = len(bigrams)
        probs = [c / total for c in freq.values()]
        entropy = -sum(p * math.log2(p) for p in probs if p > 0)
        max_entropy = math.log2(total) if total > 1 else 1.0
        normalized = entropy / max_entropy if max_entropy > 0 else 0.5
        # Low normalized entropy → predictable → AI-flat
        return 1.0 - normalized
