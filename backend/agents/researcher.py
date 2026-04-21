"""Researcher agent: searches SearXNG and scrapes full-text content asynchronously."""
from __future__ import annotations

import asyncio
import re
from typing import Any
from urllib.parse import urlparse

import httpx
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

from db.vector_store import VectorStore
from models import EvidenceDocument

SEARXNG_URL = "http://localhost:8888/search"
MAX_CONCURRENT_SCRAPES = 8
SCRAPE_TIMEOUT = 12.0

_NOISE_PATTERNS = re.compile(
    r"cookie|gdpr|privacy policy|accept all|subscribe|newsletter|"
    r"sign in|log in|log out|advertisement|terms of service|all rights reserved|"
    r"skip to content|jump to|click here|read more|see more|show more",
    re.IGNORECASE,
)

# Prompt-injection markers: drop any paragraph containing these to protect the auditor LLM.
_INJECTION_PATTERNS = re.compile(
    r"you are an (ai|llm|language model|assistant|chatbot)|"
    r"ignore (previous|above|prior|all) instructions|"
    r"(system|user|assistant) prompt|"
    r"<\|im_start\|>|<\|im_end\|>|\[INST\]|\[/INST\]|"
    r"disregard (previous|above)|forget (your|all) (previous|prior)|"
    r"new instructions:|from now on you",
    re.IGNORECASE,
)


def _clean_content(text: str) -> str:
    """Remove navigation/boilerplate/prompt-injection paragraphs from crawled markdown."""
    lines = text.splitlines()
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if len(s) < 30 and s[-1] not in ".!?:":
            continue
        alpha = sum(c.isalpha() for c in s)
        if alpha / max(len(s), 1) < 0.45:
            continue
        if _NOISE_PATTERNS.search(s):
            continue
        if _INJECTION_PATTERNS.search(s):
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return "\n".join(out)


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
                config = CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    word_count_threshold=50,
                    verbose=False,
                )
                async with AsyncWebCrawler(verbose=False) as crawler:
                    result = await asyncio.wait_for(
                        crawler.arun(url=url, config=config),
                        timeout=SCRAPE_TIMEOUT,
                    )
                domain = urlparse(url).netloc
                # Sanitise to ASCII-safe unicode to avoid cp1252 errors on Windows
                raw_md = result.markdown or ""
                content = _clean_content(raw_md.encode("utf-8", errors="replace").decode("utf-8"))
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
