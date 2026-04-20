"""Ephemeral ChromaDB vector store for per-session evidence storage."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

import chromadb
from chromadb.config import Settings

if TYPE_CHECKING:
    from agents.researcher import EvidenceDocument


class VectorStore:
    """
    Per-request ephemeral ChromaDB instance.
    Stores scraped evidence as embeddings for semantic retrieval during auditing.
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._client = chromadb.Client(
            Settings(anonymized_telemetry=False, allow_reset=True)
        )
        self._collection = self._client.create_collection(
            name=f"evidence_{session_id[:8]}",
            metadata={"hnsw:space": "cosine"},
        )

    async def upsert_documents(self, docs: list["EvidenceDocument"]) -> None:
        if not docs:
            return

        valid_docs = [d for d in docs if d.content.strip()]
        if not valid_docs:
            return

        self._collection.upsert(
            documents=[d.content[:4000] for d in valid_docs],
            metadatas=[
                {
                    "url": d.url,
                    "domain": d.domain,
                    "title": d.title,
                    "claim_id": d.claim_id,
                    "word_count": d.word_count,
                    "is_https": str(d.is_https),
                }
                for d in valid_docs
            ],
            ids=[f"{d.claim_id}_{i}" for i, d in enumerate(valid_docs)],
        )

    def query_relevant(
        self, claim_text: str, claim_id: str, top_k: int = 5
    ) -> list[dict[str, Any]]:
        try:
            results = self._collection.query(
                query_texts=[claim_text],
                n_results=min(top_k, self._collection.count()),
                where={"claim_id": claim_id},
            )
            docs = results.get("documents", [[]])[0]
            metas = results.get("metadatas", [[]])[0]
            return [{"content": d, **m} for d, m in zip(docs, metas)]
        except Exception:
            return []

    def cleanup(self) -> None:
        try:
            self._client.delete_collection(f"evidence_{self.session_id[:8]}")
        except Exception:
            pass
