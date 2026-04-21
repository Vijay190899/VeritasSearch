"""Researcher agent: searches SearXNG and scrapes full-text content asynchronously."""
from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

import httpx
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

from db.vector_store import VectorStore
from models import EvidenceDocument

SEARXNG_URL = "http://localhost:8888/search"
MAX_CONCURRENT_SCRAPES = 5
SCRAPE_TIMEOUT = 20.0


class ResearcherAgent:
    def __init__(self, vector_store: VectorStore) -> None:
        self.vector_store = vector_store
        self._http = httpx.AsyncClient(timeout=15.0)
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)

    async def gather(
        self, claims: list[dict[str, Any]], max_sources: int = 10
    ) -> list[EvidenceDocument]:
        tasks = [
            self._gather_for_claim(claim, max_sources) for claim in claims
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        docs: list[EvidenceDocument] = []
        for batch in results:
            if isinstance(batch, list):
                docs.extend(batch)
        await self.vector_store.upsert_documents(docs)
        return docs

    async def _gather_for_claim(
        self, claim: dict[str, Any], max_sources: int
    ) -> list[EvidenceDocument]:
        urls = await self._search(claim["search_query"], max_sources)
        tasks = [self._scrape(url, claim["id"]) for url in urls]
        scraped = await asyncio.gather(*tasks, return_exceptions=True)
        return [d for d in scraped if isinstance(d, EvidenceDocument) and d.word_count > 50]

    async def _search(self, query: str, count: int) -> list[str]:
        try:
            resp = await self._http.get(
                SEARXNG_URL,
                params={"q": query, "format": "json", "engines": "google,bing,duckduckgo"},
            )
            resp.raise_for_status()
            data = resp.json()
            return [r["url"] for r in data.get("results", [])[:count]]
        except Exception:
            return []

    async def _scrape(self, url: str, claim_id: str) -> EvidenceDocument | Exception:
        async with self._semaphore:
            try:
                config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, word_count_threshold=50)
                async with AsyncWebCrawler() as crawler:
                    result = await asyncio.wait_for(
                        crawler.arun(url=url, config=config),
                        timeout=SCRAPE_TIMEOUT,
                    )
                domain = urlparse(url).netloc
                # Sanitise to ASCII-safe unicode to avoid cp1252 errors on Windows
                raw_md = result.markdown or ""
                content = raw_md.encode("utf-8", errors="replace").decode("utf-8")
                title_raw = (result.metadata or {}).get("title", domain)
                title = str(title_raw).encode("utf-8", errors="replace").decode("utf-8")
                return EvidenceDocument(
                    url=url,
                    domain=domain,
                    title=title,
                    content=content,
                    claim_id=claim_id,
                )
            except Exception as exc:
                return exc

    async def aclose(self) -> None:
        await self._http.aclose()
