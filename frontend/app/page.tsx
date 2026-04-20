"use client";

import { useState, useCallback } from "react";
import { Search, Shield, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import EvidenceMap from "@/components/EvidenceMap";
import TrustMeter from "@/components/TrustMeter";
import type { VerificationReport, AuditResult } from "@/lib/types";

type AppState = "idle" | "loading" | "done" | "error";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    setStatusLog((prev) => [...prev, msg]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!query.trim()) return;
    setAppState("loading");
    setReport(null);
    setAudit(null);
    setStatusLog([]);

    try {
      const eventSource = new EventSource(
        `/api/verify/stream?query=${encodeURIComponent(query)}`
      );

      // Using fetch + SSE via POST
      const res = await fetch("/api/verify/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, max_sources: 10 }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n").filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.replace("data: ", ""));
          if (payload.event === "claims") log(`Decomposed into ${payload.data?.length ?? 0} claims`);
          if (payload.event === "evidence_ready") log(`Scraped ${payload.count} sources`);
          if (payload.event === "audit_complete") {
            setAudit(payload.data);
            log("Audit complete");
          }
          if (payload.event === "report") {
            setReport(payload.data);
            setAppState("done");
          }
        }
      }
    } catch (err) {
      console.error(err);
      setAppState("error");
    }
  }, [query, log]);

  return (
    <main className="min-h-dvh bg-gray-950 text-gray-100 flex flex-col items-center px-4 py-12">
      {/* Header */}
      <header className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Shield className="w-9 h-9 text-emerald-400" aria-hidden="true" />
          <h1 className="text-4xl font-bold tracking-tight text-white">VeritasSearch</h1>
        </div>
        <p className="text-gray-400 text-base max-w-md mx-auto leading-relaxed">
          Evidence-first search. Every answer comes with a provenance score and
          an auditable evidence chain.
        </p>
      </header>

      {/* Search bar */}
      <section
        className="w-full max-w-2xl bg-gray-900/60 backdrop-blur-md border border-gray-700/60 rounded-2xl p-4 shadow-xl"
        aria-label="Search"
      >
        <div className="flex gap-3 items-center">
          <label htmlFor="query-input" className="sr-only">Enter your query</label>
          <input
            id="query-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="e.g. Does drinking coffee reduce Alzheimer's risk?"
            className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-base py-2 px-1"
            disabled={appState === "loading"}
            aria-describedby="query-hint"
          />
          <button
            onClick={handleSubmit}
            disabled={appState === "loading" || !query.trim()}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors duration-150 min-w-[100px] justify-center"
            aria-label="Verify query"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            {appState === "loading" ? "Verifying…" : "Verify"}
          </button>
        </div>
        <p id="query-hint" className="text-xs text-gray-600 mt-2 px-1">
          Powered by Phi-3.5 + SearXNG · Runs fully local
        </p>
      </section>

      {/* Status log */}
      {statusLog.length > 0 && appState === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 w-full max-w-2xl bg-gray-900/40 border border-gray-800 rounded-xl px-4 py-3 space-y-1"
        >
          {statusLog.map((msg, i) => (
            <p key={i} className="text-xs text-gray-400 font-mono flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              {msg}
            </p>
          ))}
        </div>
      )}

      {/* Error state */}
      {appState === "error" && (
        <div role="alert" className="mt-6 w-full max-w-2xl bg-red-900/20 border border-red-700/40 rounded-xl p-4 flex gap-3 items-start">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-red-300 text-sm">Verification failed. Ensure the backend is running on port 8000.</p>
        </div>
      )}

      {/* Results */}
      {appState === "done" && report && audit && (
        <section
          className="mt-8 w-full max-w-4xl space-y-6"
          aria-label="Verification results"
        >
          {/* Trust meter + answer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 bg-gray-900/60 backdrop-blur-md border border-gray-700/60 rounded-2xl p-5 flex flex-col items-center justify-center gap-4">
              <TrustMeter score={report.trust_score} />
              {report.has_conflicts && (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  Sources conflict
                </div>
              )}
            </div>

            <div className="md:col-span-2 bg-gray-900/60 backdrop-blur-md border border-gray-700/60 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Synthesized Answer
              </h2>
              <p className="text-gray-100 leading-relaxed text-sm whitespace-pre-line">
                {report.answer}
              </p>
              <p className="text-xs text-gray-500 mt-4">
                Based on {report.source_count} sources across {audit.verdicts.length} claims
              </p>
            </div>
          </div>

          {/* Claim verdicts */}
          <div className="bg-gray-900/60 backdrop-blur-md border border-gray-700/60 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Claim Audit
            </h2>
            <div className="space-y-3">
              {audit.verdicts.map((v) => (
                <div
                  key={v.claim_id}
                  className={`rounded-xl p-4 border ${
                    v.is_controversial
                      ? "border-amber-700/50 bg-amber-900/10"
                      : v.consensus_score >= 0.6
                      ? "border-emerald-700/40 bg-emerald-900/10"
                      : "border-gray-700/40 bg-gray-800/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {v.is_controversial ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
                    ) : v.consensus_score >= 0.6 ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200">{v.claim_text}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span>Consensus: <strong className="text-gray-300">{(v.consensus_score * 100).toFixed(0)}%</strong></span>
                        <span>Trust: <strong className="text-gray-300">{(v.provenance_score * 100).toFixed(0)}</strong></span>
                        <span className="text-emerald-500">{v.supports.length} support</span>
                        {v.refutes.length > 0 && (
                          <span className="text-red-400">{v.refutes.length} refute</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence graph */}
          <div className="bg-gray-900/60 backdrop-blur-md border border-gray-700/60 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Evidence Map
            </h2>
            <EvidenceMap verdicts={audit.verdicts} />
          </div>
        </section>
      )}
    </main>
  );
}
