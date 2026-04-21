# VeritasSearch — User Guide & Instruction Manual

> Evidence-first search. Every answer carries a Provenance Score and an auditable evidence chain.

---

## Table of Contents

1. [What VeritasSearch Does](#1-what-veritassearch-does)
2. [How It Works (Plain English)](#2-how-it-works-plain-english)
3. [Setup & Installation](#3-setup--installation)
4. [Running the System](#4-running-the-system)
5. [Using the Web UI](#5-using-the-web-ui)
6. [Understanding Your Results](#6-understanding-your-results)
7. [Using the API Directly](#7-using-the-api-directly)
8. [Tuning for Your Hardware](#8-tuning-for-your-hardware)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. What VeritasSearch Does

Standard search engines and AI assistants retrieve information and present it confidently — even when sources contradict each other, or when the "source" is an AI-written SEO article.

VeritasSearch does something different:

| Standard RAG | VeritasSearch |
|---|---|
| Retrieves top-N documents | Decomposes your query into atomic claims |
| Summarises what it finds | Cross-verifies each claim across 10+ independent sources |
| Returns one confident answer | Returns an answer **plus** a Provenance Score (0–100) |
| Hides conflicts | Explicitly flags when sources contradict each other |
| No audit trail | Shows exactly which domain said what |

---

## 2. How It Works (Plain English)

When you submit a query, five things happen in sequence:

```
Your query
    │
    ▼
① PLANNER  —  Phi-3.5 breaks your query into 3–5 testable facts
    │           e.g. "Coffee reduces Alzheimer's risk" →
    │               Claim 1: "Caffeine has neuroprotective effects"
    │               Claim 2: "Studies link coffee to lower dementia rates"
    │               Claim 3: "Effect is statistically significant"
    ▼
② RESEARCHER  —  Searches SearXNG (privacy-first, no tracking)
    │             Scrapes full text from up to 10 URLs per claim
    │             Runs up to 5 scrapers in parallel (async)
    ▼
③ AUDITOR  —  For each scraped page, asks Phi-3.5:
    │           "Does this text SUPPORT, REFUTE, or IGNORE Claim 1?"
    │           Tallies votes across all domains
    ▼
④ SCORER  —  Calculates Provenance Score:
    │          S_p = 0.50 × consensus
    │              + 0.30 × source authority
    │              + 0.20 × (1 − AI-flatness)
    ▼
⑤ REPORTER  —  Synthesises a final answer
                Explicitly states any conflicts or unverifiable claims
```

Everything runs **100% locally** — no data leaves your machine.

---

## 3. Setup & Installation

### Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| GPU | RTX 2070 (8 GB VRAM) | 4-bit model uses ~2.2 GB |
| RAM | 16 GB | 32 GB recommended |
| Python | 3.11+ | |
| Node.js | 18+ | For the frontend |
| Docker | 24+ | For SearXNG |
| Ollama | Latest | Local LLM runtime |

### Step 1 — Pull the model

```bash
# 4-bit quantised Phi-3.5-mini — fits comfortably in 8 GB VRAM
ollama pull phi3.5:q4_K_M
```

Verify it works:
```bash
ollama run phi3.5:q4_K_M "Say hello"
```

### Step 2 — Start SearXNG (privacy-first search)

```bash
cd veritas_engine
docker-compose up -d searxng
```

Verify: open `http://localhost:8888` — you should see a search page.

### Step 3 — Install backend dependencies

```bash
cd veritas_engine/backend

# Recommended: use uv for fast installs
pip install uv
uv pip install -e ".[dev]"

# Install Playwright browser for scraping
playwright install chromium
```

### Step 4 — Install frontend dependencies

```bash
cd veritas_engine/frontend
npm install
```

### Step 5 — Configure environment

```bash
cp .env.example .env
# No changes needed for local defaults
```

---

## 4. Running the System

You need **three** processes running simultaneously. Open three terminals:

**Terminal 1 — SearXNG (if not already running)**
```bash
docker-compose up searxng
```

**Terminal 2 — Backend API**
```bash
cd veritas_engine/backend
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**Terminal 3 — Frontend**
```bash
cd veritas_engine/frontend
npm run dev
```

You should see:
```
▲ Next.js 15.1.0
   - Local: http://localhost:3000
```

Open `http://localhost:3000` in your browser.

---

## 5. Using the Web UI

### Submitting a Query

1. Type your question in the search bar
2. Press **Enter** or click **Verify**
3. Watch the live status log — it shows you each pipeline stage as it runs

**Good query types:**
- Factual claims: *"Does vitamin D reduce COVID severity?"*
- Contested topics: *"Is nuclear energy carbon-neutral?"*
- Historical facts: *"Did Einstein fail school mathematics?"*
- Scientific consensus: *"Is the James Webb telescope further than Hubble?"*

**Avoid:**
- Purely subjective questions (*"What's the best pizza?"*)
- Queries requiring real-time data (*"What is the Bitcoin price right now?"*)
- Very niche topics with fewer than 5 web sources

---

## 6. Understanding Your Results

### The Trust Meter

The circular gauge on the left shows the **Provenance Score** (0–100).

| Score | Label | Meaning |
|---|---|---|
| 75–100 | **High Trust** | Strong consensus across authoritative sources |
| 50–74 | **Moderate** | General agreement, some noise |
| 25–49 | **Low Trust** | Mixed signals or weak sources |
| 0–24 | **Unverifiable** | Insufficient or contradictory evidence |

> The score is not a measure of truth — it measures *verifiability given the sources found*. A true fact that only appears on one small blog will score low.

### The Synthesised Answer

Plain-language response based only on what the evidence supports. Key signals:

- **"Source X says… however Source Y says…"** → Controversy detected, both views shown
- **"[UNVERIFIABLE]"** → Fewer than 60% of sources agreed on this claim
- **Domain citations** → Every claim is backed by named domains you can visit

### The Claim Audit Panel

Each of your original claims gets its own card showing:

- **Consensus %** — what fraction of sources support vs refute it
- **Support count** — number of domains that agree
- **Refute count** — number of domains that disagree (shows in red)
- **Trust score** — the per-claim Provenance Score

An **amber warning icon** means the claim is controversial (sources actively conflict).  
A **green check** means clear consensus.  
A **grey X** means insufficient data.

### The Evidence Map

The SVG graph at the bottom shows the structure of evidence:

- **Rectangular nodes** = your claims (colour-coded by claim number)
- **Circular nodes** = source domains
- **Green arrows** = domain supports the claim
- **Red arrows** = domain refutes the claim

You can use this to spot if one domain is driving an entire consensus, or if refutations come from a specific category of source.

---

## 7. Using the API Directly

The backend exposes two endpoints. Use these to integrate VeritasSearch into your own tools.

### POST `/api/verify` — Synchronous

Returns the full result once all processing is complete.

```bash
curl -X POST http://localhost:8000/api/verify \
  -H "Content-Type: application/json" \
  -d '{"query": "Does aspirin prevent heart attacks?", "max_sources": 10}'
```

**Response:**
```json
{
  "session_id": "abc-123",
  "report": {
    "answer": "Multiple high-authority sources including...",
    "trust_score": 0.78,
    "has_conflicts": false,
    "source_count": 24
  },
  "audit": {
    "verdicts": [
      {
        "claim_id": "c1",
        "claim_text": "Aspirin inhibits platelet aggregation",
        "supports": ["nih.gov", "mayoclinic.org", "bmj.com"],
        "refutes": [],
        "consensus_score": 1.0,
        "is_controversial": false,
        "provenance_score": 0.91
      }
    ],
    "overall_trust": 0.78,
    "has_conflicts": false
  }
}
```

### POST `/api/verify/stream` — Server-Sent Events

Returns live progress events as each pipeline stage completes. Use this for UIs or CLI tools that want real-time feedback.

```bash
curl -X POST http://localhost:8000/api/verify/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "Is coffee good for you?"}' \
  --no-buffer
```

**Event sequence:**
```
data: {"event": "session_start", "session_id": "xyz-456"}

data: {"event": "claims", "data": [...], "count": 3}

data: {"event": "evidence_ready", "count": 27}

data: {"event": "audit_complete", "data": {...}}

data: {"event": "report", "data": {...}}

data: {"event": "done"}
```

### GET `/health`

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

---

## 8. Tuning for Your Hardware

### Changing the Model

Edit `backend/agents/planner.py`, `auditor.py`, and `reporter.py` — change `OLLAMA_MODEL`:

| Model | VRAM | Speed | Quality |
|---|---|---|---|
| `phi3.5:q4_K_M` | ~2.2 GB | Fast | Good |
| `phi3.5:q8_0` | ~3.8 GB | Medium | Better |
| `qwen2.5:3b-q4_K_M` | ~2.0 GB | Fastest | Comparable |
| `mistral:7b-q4_K_M` | ~4.5 GB | Slow | Best |

### Adjusting Concurrency

In `backend/agents/researcher.py`:
```python
MAX_CONCURRENT_SCRAPES = 5   # lower if you get rate-limited; raise for faster scraping
```

### Adjusting Source Count

In the API call or UI, `max_sources` controls how many URLs are fetched per claim.
- `5` → Fast (~30s total), less thorough
- `10` → Balanced (~60s total) — default
- `15` → Thorough (~90s total), better consensus accuracy

### Controversy Threshold

In `backend/agents/auditor.py`:
```python
CONSENSUS_THRESHOLD = 0.60   # claim is flagged controversial if fewer than 60% agree
```
Raise to `0.75` for stricter controversy detection; lower to `0.45` for more lenient.

---

## 9. Troubleshooting

### "Verify" button spins forever

1. Check the backend is running: `curl http://localhost:8000/health`
2. Check Ollama is running: `ollama list`
3. Check SearXNG: `curl http://localhost:8888/search?q=test&format=json`

### Trust score is always 0 or very low

- SearXNG may not be returning results. Try opening `http://localhost:8888` and searching manually.
- The model may be returning malformed JSON. Run `ollama run phi3.5:q4_K_M` and test a prompt manually.

### "Cannot connect to Ollama"

```bash
# Start Ollama manually
ollama serve
```

If using Docker, ensure the container has GPU access:
```bash
docker run --gpus all ollama/ollama
```

### Scraping returns 0 results

Playwright browsers may not be installed:
```bash
playwright install chromium --with-deps
```

### Backend import errors on startup

Install all dependencies:
```bash
cd backend
uv pip install -e ".[dev]"
```

### The Evidence Map shows no nodes

This means the audit returned no SUPPORTS or REFUTES verdicts — all sources were marked IRRELEVANT. This usually means the scraped content was too short or in a language the model doesn't handle well. Try increasing `max_sources`.

---

## Architecture Reference (Quick)

```
veritas_engine/
├── backend/
│   ├── main.py            ← FastAPI: POST /api/verify, POST /api/verify/stream
│   ├── graph.py           ← LangGraph pipeline + create_pipeline() factory
│   ├── models.py          ← EvidenceDocument (shared dataclass)
│   ├── agents/
│   │   ├── planner.py     ← Query → atomic claims (Ollama JSON mode)
│   │   ├── researcher.py  ← SearXNG search + Crawl4AI scraping
│   │   ├── auditor.py     ← SUPPORTS/REFUTES verdict per document
│   │   └── reporter.py    ← Final answer synthesis
│   ├── logic/
│   │   ├── scoring.py     ← Provenance Score formula
│   │   └── ai_detector.py ← Detects AI-generated "flat" text
│   └── db/
│       └── vector_store.py ← Ephemeral ChromaDB per session
└── frontend/
    ├── app/page.tsx        ← Main UI
    ├── components/
    │   ├── TrustMeter.tsx  ← Animated score gauge
    │   └── EvidenceMap.tsx ← SVG evidence graph
    └── lib/types.ts        ← Shared TypeScript types
```
