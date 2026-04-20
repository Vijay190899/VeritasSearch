# VeritasSearch — CLAUDE.md

## Project Overview
Evidence-First Provenance Engine. Multi-agent LangGraph system that decomposes queries into atomic claims, searches SearXNG, scrapes 10+ sources with Crawl4AI, audits with Phi-3.5-mini (4-bit via Ollama), and returns a Provenance Score (S_p).

## Stack
- **Backend**: FastAPI + LangGraph + Ollama (Phi-3.5) + ChromaDB + Crawl4AI
- **Frontend**: Next.js 15 + Tailwind CSS + TypeScript
- **Search**: SearXNG (local Docker)
- **GPU**: RTX 2070 · 8GB VRAM · 4-bit quant via Ollama

## Architecture

```
query → PlannerAgent (Phi-3.5) → [c1, c2, c3]
                                      ↓
                              ResearcherAgent (Crawl4AI + SearXNG async)
                                      ↓
                              AuditorAgent (Phi-3.5 verdict per doc)
                                      ↓
                              ReporterAgent (Phi-3.5 synthesis)
                                      ↓
                              S_p score + Evidence graph
```

LangGraph state: `VeritasState` in `backend/graph.py`. Routing: if no evidence scraped, skip audit and go straight to report.

## Key Files
- `backend/main.py` — FastAPI entry, SSE streaming endpoint
- `backend/graph.py` — LangGraph compiled pipeline
- `backend/agents/planner.py` — Query → atomic claims (Ollama JSON mode)
- `backend/agents/researcher.py` — Async scraper with semaphore (max 5 concurrent)
- `backend/agents/auditor.py` — Per-doc SUPPORTS/REFUTES verdict + consensus
- `backend/agents/reporter.py` — Final answer synthesis
- `backend/logic/scoring.py` — S_p = 0.5×consensus + 0.3×authority + 0.2×(1-ai_flatness)
- `backend/logic/ai_detector.py` — Bigram entropy + TTR + filler phrase density
- `backend/db/vector_store.py` — Ephemeral ChromaDB per request
- `frontend/app/page.tsx` — Main UI with SSE stream consumption
- `frontend/components/TrustMeter.tsx` — SVG arc trust gauge
- `frontend/components/EvidenceMap.tsx` — SVG evidence graph

## Skills Integrated
- **Graphify** (`/graphify`): Run on `backend/` to get a knowledge graph of agent relationships. Installed at `~/.claude/skills/graphify/SKILL.md`.
- **UI/UX Pro Max** (auto): Applies during any frontend component work. 67 UI styles, 161 palettes. Installed at `~/.claude/skills/ui-ux-pro-max/SKILL.md`. Current style: **glassmorphism dark** with emerald brand color.

## Dev Setup
```bash
# 1. Pull Phi-3.5 with 4-bit quant
ollama pull phi3.5:q4_K_M

# 2. Start SearXNG + Ollama
docker-compose up -d searxng ollama

# 3. Backend
cd backend && uv pip install -e ".[dev]" && uvicorn main:app --reload

# 4. Frontend
cd frontend && npm install && npm run dev
```

## Provenance Score Formula
$$S_p = 0.50 \times C_{consensus} + 0.30 \times A_{authority} + 0.20 \times (1 - E_{ai\_flatness})$$

Controversy triggered when `consensus_score < 0.60` with ≥3 sources.
