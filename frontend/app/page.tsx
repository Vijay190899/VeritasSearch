"use client";

import { useState, useCallback, useRef } from "react";
import {
  Search, Shield, AlertTriangle, CheckCircle, XCircle,
  Loader2, Sparkles, Globe, Zap, ArrowRight,
} from "lucide-react";
import EvidenceMap from "@/components/EvidenceMap";
import TrustMeter from "@/components/TrustMeter";
import type { VerificationReport, AuditResult } from "@/lib/types";

type AppState = "idle" | "loading" | "done" | "error";

const STEPS = [
  { label: "Decomposing into claims", icon: Sparkles },
  { label: "Scraping sources", icon: Globe },
  { label: "Auditing evidence", icon: Zap },
  { label: "Generating report", icon: Shield },
];

const SUGGESTIONS = [
  "Does coffee lower Alzheimer's risk?",
  "Is 5G radiation harmful to humans?",
  "Does vitamin C prevent the common cold?",
  "Are electric cars better for the environment?",
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [step, setStep] = useState(-1);
  const [logs, setLogs] = useState<string[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleVerify = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setAppState("loading");
    setReport(null);
    setAudit(null);
    setStep(0);
    setLogs([]);
    setStreamError(null);

    try {
      const res = await fetch("http://localhost:8000/api/verify/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, max_sources: 10 }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Backend returned ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotReport = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on SSE message boundaries
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          const evt = payload.event as string;

          if (evt === "claims") {
            setStep(1);
            const count = (payload.data as unknown[])?.length ?? 0;
            setLogs((p) => [...p, `Decomposed into ${count} claim${count !== 1 ? "s" : ""}`]);
          } else if (evt === "evidence_ready") {
            setStep(2);
            setLogs((p) => [...p, `Gathered ${payload.count ?? 0} sources`]);
          } else if (evt === "audit_complete") {
            setStep(3);
            const auditData = payload.data as AuditResult | null;
            if (auditData && typeof auditData === "object") setAudit(auditData);
            setLogs((p) => [...p, "Evidence audit complete"]);
          } else if (evt === "report") {
            gotReport = true;
            const rpt = payload.data as VerificationReport | null;
            if (rpt && typeof rpt === "object") {
              setReport(rpt);
              setStep(4);
              setAppState("done");
            }
          }
        }
      }

      if (!gotReport) {
        setStreamError("Pipeline completed without a result — check the backend logs.");
        setAppState("error");
      }
    } catch (err) {
      console.error(err);
      setStreamError(err instanceof Error ? err.message : "Unknown error");
      setAppState("error");
    }
  }, [query]);

  return (
    <div className="min-h-dvh bg-[#08090f] text-slate-100 flex flex-col">
      {/* Ambient top glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-64 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(16,185,129,0.25) 0%, transparent 100%)",
        }}
      />

      <main className="flex-1 flex flex-col items-center px-4 py-16 relative z-10">
        {/* ── Header ── */}
        <header className="mb-12 text-center max-w-xl">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3.5 py-1 mb-7 text-xs font-medium text-emerald-400 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Phi-3.5 · SearXNG · Fully Local
          </div>

          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield
              className="w-9 h-9 text-emerald-400 shrink-0"
              style={{ filter: "drop-shadow(0 0 10px rgba(16,185,129,0.65))" }}
              aria-hidden="true"
            />
            <h1
              className="text-5xl font-bold tracking-tight"
              style={{
                background: "linear-gradient(135deg, #34d399 0%, #6ee7b7 50%, #10b981 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              VeritasSearch
            </h1>
          </div>

          <p className="text-slate-400 text-[15px] leading-relaxed">
            Every answer arrives with a provenance score and a full evidence chain —
            not just the model&rsquo;s best guess.
          </p>
        </header>

        {/* ── Search bar ── */}
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-2 bg-[#111218] border border-[#2a2b38] rounded-2xl px-4 py-2 transition-colors duration-150 focus-within:border-emerald-500/60 focus-within:bg-[#13141c]">
            <Search className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              id="query-input"
              type="text"
              aria-label="Enter a claim to verify"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="e.g. Does drinking coffee reduce Alzheimer's risk?"
              className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 outline-none text-[15px] py-2.5"
              disabled={appState === "loading"}
              autoComplete="off"
              spellCheck="false"
            />
            <button
              onClick={handleVerify}
              disabled={appState === "loading" || !query.trim()}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-[#1e2029] disabled:text-slate-600 disabled:cursor-not-allowed text-[#08090f] text-sm font-semibold px-4 py-2 rounded-xl transition-colors duration-150 min-w-[90px] justify-center shrink-0 cursor-pointer"
            >
              {appState === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {appState === "loading" ? "Running…" : "Verify"}
            </button>
          </div>
          <p className="text-xs text-slate-600 text-center mt-2">
            Press <span className="text-slate-500 font-mono">↵ Enter</span> to verify
          </p>
        </div>

        {/* ── Pipeline progress ── */}
        {appState === "loading" && (
          <div
            role="status"
            aria-live="polite"
            className="mt-8 w-full max-w-2xl bg-[#111218] border border-[#2a2b38] rounded-2xl p-5"
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
              Verification Pipeline
            </p>
            <div className="space-y-2.5">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = i < step;
                const active = i === step;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        done
                          ? "bg-emerald-500/15 text-emerald-400"
                          : active
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-[#1a1b25] text-slate-600"
                      }`}
                    >
                      {done ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : active ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span
                      className={`text-sm transition-colors ${
                        done ? "text-slate-500 line-through decoration-slate-700" : active ? "text-slate-200" : "text-slate-600"
                      }`}
                    >
                      {s.label}
                    </span>
                    {active && (
                      <span className="ml-auto text-[11px] text-emerald-500 font-mono animate-pulse">
                        running…
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {logs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#1e1f2a] space-y-1">
                {logs.map((l, i) => (
                  <p key={i} className="text-[11px] text-slate-500 font-mono flex gap-2">
                    <span className="text-emerald-600">›</span>
                    {l}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {appState === "error" && (
          <div
            role="alert"
            className="mt-8 w-full max-w-2xl bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex gap-3"
          >
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Verification failed</p>
              {streamError && (
                <p className="text-xs text-slate-500 mt-1 font-mono">{streamError}</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Make sure the backend (port 8000) and SearXNG (port 8888) are running.
              </p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {appState === "done" && report && (
          <section
            aria-label="Verification results"
            className="mt-10 w-full max-w-4xl space-y-4"
          >
            {/* Trust score + answer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 bg-[#111218] border border-[#2a2b38] rounded-2xl p-6 flex flex-col items-center justify-center gap-4">
                <TrustMeter score={report.trust_score ?? 0} />
                {report.has_conflicts && (
                  <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1 text-amber-400 text-xs font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    Sources conflict
                  </div>
                )}
                <p className="text-[11px] text-slate-600 text-center">
                  {report.source_count ?? 0} sources
                  {(audit?.verdicts?.length ?? 0) > 0
                    ? ` · ${audit!.verdicts.length} claims`
                    : ""}
                </p>
              </div>

              <div className="md:col-span-2 bg-[#111218] border border-[#2a2b38] rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest">
                    Synthesised Answer
                  </span>
                </div>
                <p className="text-slate-200 leading-relaxed text-sm whitespace-pre-wrap">
                  {report.answer}
                </p>
              </div>
            </div>

            {/* Claim audit */}
            {(audit?.verdicts?.length ?? 0) > 0 && (
              <div className="bg-[#111218] border border-[#2a2b38] rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest">
                    Claim Audit
                  </span>
                </div>
                <div className="space-y-3">
                  {audit!.verdicts.map((v) => {
                    const controversial = v.is_controversial;
                    const supported = !controversial && (v.consensus_score ?? 0) >= 0.6;
                    return (
                      <div
                        key={v.claim_id}
                        className={`rounded-xl p-4 border ${
                          controversial
                            ? "border-amber-500/20 bg-amber-500/[0.04]"
                            : supported
                            ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                            : "border-[#1e2029] bg-[#0e0f16]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {controversial ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                          ) : supported ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 leading-relaxed">
                              {v.claim_text}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2.5">
                              <span className="text-[11px] bg-[#1a1b25] rounded-md px-2 py-0.5 text-slate-400">
                                Consensus{" "}
                                <strong className="text-slate-200">
                                  {((v.consensus_score ?? 0) * 100).toFixed(0)}%
                                </strong>
                              </span>
                              <span className="text-[11px] bg-[#1a1b25] rounded-md px-2 py-0.5 text-slate-400">
                                S_p{" "}
                                <strong className="text-slate-200">
                                  {((v.provenance_score ?? 0) * 100).toFixed(0)}
                                </strong>
                              </span>
                              {(v.supports?.length ?? 0) > 0 && (
                                <span className="text-[11px] text-emerald-500 font-medium">
                                  {v.supports.length} support
                                </span>
                              )}
                              {(v.refutes?.length ?? 0) > 0 && (
                                <span className="text-[11px] text-red-400 font-medium">
                                  {v.refutes.length} refute
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Evidence map */}
            {(audit?.verdicts?.length ?? 0) > 0 && (
              <div className="bg-[#111218] border border-[#2a2b38] rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest">
                    Evidence Map
                  </span>
                </div>
                <EvidenceMap verdicts={audit!.verdicts} />
              </div>
            )}
          </section>
        )}

        {/* ── Idle suggestions ── */}
        {appState === "idle" && (
          <div className="mt-14 text-center">
            <p className="text-[11px] text-slate-600 uppercase tracking-widest mb-5">
              Try asking
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setQuery(s);
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 bg-[#111218] hover:bg-emerald-500/[0.08] border border-[#2a2b38] hover:border-emerald-500/25 rounded-full px-3.5 py-1.5 transition-colors duration-150 cursor-pointer"
                >
                  <ArrowRight className="w-3 h-3" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
