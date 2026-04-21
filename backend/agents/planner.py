"""Planner agent: decomposes a user query into 3-5 atomic verifiable claims."""
from __future__ import annotations

import json
from typing import Any

import httpx

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "phi3.5:latest"

# No JSON example in the prompt — that confuses phi3.5.
# format:"json" guarantees structurally valid JSON output.
DECOMPOSE_PROMPT = """\
Break this query into 2 to 3 verifiable factual claims.
Return JSON: {{"claims":[{{"id":"c1","text":"declarative sentence","search_query":"web search terms"}}]}}
Query: {query}
"""


class PlannerAgent:
    def __init__(self, model: str = OLLAMA_MODEL) -> None:
        self.model = model
        self._client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=120.0)

    async def decompose(self, query: str) -> list[dict[str, Any]]:
        prompt = DECOMPOSE_PROMPT.format(query=query)
        response = await self._client.post(
            "/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "format": "json",   # Forces valid JSON output
            },
        )
        response.raise_for_status()
        raw: str = response.json().get("response", "{}").strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return self._fallback(query)

        return self._extract(data, query)

    def _extract(self, data: Any, query: str) -> list[dict[str, Any]]:
        """Normalise whatever valid JSON structure the model returned."""
        # Flatten: unwrap {"claims": [...]} or accept a bare list
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = None
            for v in data.values():
                if isinstance(v, list) and v:
                    items = v
                    break
            if items is None:
                return self._fallback(query)
        else:
            return self._fallback(query)

        result: list[dict[str, Any]] = []
        for i, item in enumerate(items):
            if isinstance(item, str):
                result.append({"id": f"c{i+1}", "text": item, "search_query": item})
            elif isinstance(item, dict):
                text = (
                    item.get("text")
                    or item.get("claim")
                    or item.get("statement")
                    or str(item)
                )
                sq = (
                    item.get("search_query")
                    or item.get("query")
                    or item.get("search")
                    or text
                )
                result.append({
                    "id": str(item.get("id", f"c{i+1}")),
                    "text": str(text),
                    "search_query": str(sq),
                })

        # Drop claims where text is blank or clearly malformed (< 10 meaningful chars)
        result = [c for c in result if len(c["text"].strip()) >= 10]
        return result if result else self._fallback(query)

    def _fallback(self, query: str) -> list[dict[str, Any]]:
        return [{"id": "c1", "text": query, "search_query": query}]

    async def aclose(self) -> None:
        await self._client.aclose()
