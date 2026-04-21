"""Auditor agent: uses local Phi-3.5 to map evidence to claims and calculate consensus."""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from db.vector_store import VectorStore
from models import EvidenceDocument
from logic.scoring import ProvenanceScorer
from logic.ai_detector import AiFlatenessDetector

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "phi3.5:latest"
CONSENSUS_THRESHOLD = 0.60

AUDIT_PROMPT = """\
You are a fact-checking auditor. Read the text and decide if it SUPPORTS or REFUTES the claim.

Claim: {claim_text}

Text:
{snippet}

Rules:
- SUPPORTS: the text contains evidence that the claim is true.
- REFUTES: the text contains evidence that the claim is false.
- IRRELEVANT: the text has no information about the claim topic at all.
- If the text is even partially related to the claim topic, prefer SUPPORTS or REFUTES over IRRELEVANT.
- confidence: how certain you are (0.0 to 1.0).
- quote: copy the most relevant sentence from the text (max 120 chars).

Respond ONLY with valid JSON:
{{"verdict": "SUPPORTS", "confidence": 0.85, "quote": "sentence from text"}}
"""


@dataclass
class ClaimVerdict:
    claim_id: str
    claim_text: str
    supports: list[str] = field(default_factory=list)
    refutes: list[str] = field(default_factory=list)
    consensus_score: float = 0.0
    is_controversial: bool = False
    provenance_score: float = 0.0
    evidence_quotes: list[dict[str, Any]] = field(default_factory=list)


class AuditorAgent:
    def __init__(self, vector_store: VectorStore) -> None:
        self.vector_store = vector_store
        self.scorer = ProvenanceScorer()
        self.detector = AiFlatenessDetector()
        self._client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=90.0)

    async def evaluate(
        self, claims: list[dict[str, Any]], evidence: list[EvidenceDocument]
    ) -> dict[str, Any]:
        tasks = [
            self._evaluate_claim(claim, [e for e in evidence if e.claim_id == claim["id"]])
            for claim in claims
        ]
        verdicts: list[ClaimVerdict] = await asyncio.gather(*tasks)

        return {
            "verdicts": [self._verdict_to_dict(v) for v in verdicts],
            "overall_trust": self._aggregate_trust(verdicts),
            "has_conflicts": any(v.is_controversial for v in verdicts),
        }

    async def _evaluate_claim(
        self, claim: dict[str, Any], docs: list[EvidenceDocument]
    ) -> ClaimVerdict:
        verdict = ClaimVerdict(claim_id=claim["id"], claim_text=claim["text"])

        audit_tasks = [self._audit_document(claim["text"], doc) for doc in docs]
        results = await asyncio.gather(*audit_tasks, return_exceptions=True)

        for doc, result in zip(docs, results):
            if isinstance(result, dict):
                v = result.get("verdict", "IRRELEVANT")
                if v == "SUPPORTS":
                    verdict.supports.append(doc.domain)
                    verdict.evidence_quotes.append(
                        {"domain": doc.domain, "quote": result.get("quote", ""), "stance": "SUPPORTS"}
                    )
                elif v == "REFUTES":
                    verdict.refutes.append(doc.domain)
                    verdict.evidence_quotes.append(
                        {"domain": doc.domain, "quote": result.get("quote", ""), "stance": "REFUTES"}
                    )

        total = len(verdict.supports) + len(verdict.refutes)
        verdict.consensus_score = len(verdict.supports) / total if total > 0 else 0.0
        verdict.is_controversial = (
            len(verdict.refutes) > 0 and verdict.consensus_score < 0.75
        )

        ai_scores = [self.detector.score(doc.content) for doc in docs]
        verdict.provenance_score = self.scorer.calculate(
            supports=len(verdict.supports),
            refutes=len(verdict.refutes),
            docs=docs,
            ai_flatness=sum(ai_scores) / len(ai_scores) if ai_scores else 0.5,
        )

        if verdict.consensus_score < CONSENSUS_THRESHOLD and total >= 3:
            verdict.is_controversial = True

        return verdict

    async def _audit_document(self, claim_text: str, doc: EvidenceDocument) -> dict[str, Any]:
        prompt = AUDIT_PROMPT.format(claim_text=claim_text, snippet=doc.snippet(800))
        raw = "{}"
        try:
            resp = await self._client.post(
                "/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": "json"},
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "{}")
            return json.loads(raw)  # type: dict[str, Any]
        except Exception:
            match = re.search(r"\{.*?\}", raw, re.DOTALL)
            if match:
                try:
                    return cast(dict[str, Any], json.loads(match.group()))
                except json.JSONDecodeError:
                    pass
            return {"verdict": "IRRELEVANT", "confidence": 0.0, "quote": ""}

    def _verdict_to_dict(self, v: ClaimVerdict) -> dict[str, Any]:
        return {
            "claim_id": v.claim_id,
            "claim_text": v.claim_text,
            "supports": v.supports,
            "refutes": v.refutes,
            "consensus_score": round(v.consensus_score, 3),
            "is_controversial": v.is_controversial,
            "provenance_score": round(v.provenance_score, 3),
            "evidence_quotes": v.evidence_quotes,
        }

    def _aggregate_trust(self, verdicts: list[ClaimVerdict]) -> float:
        if not verdicts:
            return 0.0
        return round(sum(v.provenance_score for v in verdicts) / len(verdicts), 3)

    async def aclose(self) -> None:
        await self._client.aclose()
