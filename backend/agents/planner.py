"""Planner agent: decomposes a user query into 3-5 atomic verifiable claims."""
from __future__ import annotations

import json
import re
from typing import Any

import httpx
from pydantic import BaseModel, Field

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "phi3.5:latest"

DECOMPOSE_PROMPT = """\
You are a fact-checking assistant. Given a user query, decompose it into exactly 3 to 5 atomic, independently verifiable claims.

Each claim must:
- Be a single declarative sentence
- Be falsifiable (can be proven true or false)
- Be specific enough to search for

Return ONLY valid JSON in this exact format:
{
  "claims": [
    {"id": "c1", "text": "...", "search_query": "..."},
    {"id": "c2", "text": "...", "search_query": "..."},
    {"id": "c3", "text": "...", "search_query": "..."}
  ]
}

User query: {query}
"""


class Claim(BaseModel):
    id: str
    text: str
    search_query: str


class ClaimSet(BaseModel):
    claims: list[Claim] = Field(default_factory=list)


class PlannerAgent:
    def __init__(self, model: str = OLLAMA_MODEL) -> None:
        self.model = model
        self._client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=60.0)

    async def decompose(self, query: str) -> list[dict[str, Any]]:
        prompt = DECOMPOSE_PROMPT.format(query=query)
        response = await self._client.post(
            "/api/generate",
            json={"model": self.model, "prompt": prompt, "stream": False, "format": "json"},
        )
        response.raise_for_status()
        raw = response.json().get("response", "{}")
        try:
            parsed = ClaimSet(**json.loads(raw))
        except (json.JSONDecodeError, ValueError):
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if not json_match:
                return self._fallback_claims(query)
            parsed = ClaimSet(**json.loads(json_match.group()))

        return [c.model_dump() for c in parsed.claims]

    def _fallback_claims(self, query: str) -> list[dict[str, Any]]:
        return [{"id": "c1", "text": query, "search_query": query}]

    async def aclose(self) -> None:
        await self._client.aclose()
