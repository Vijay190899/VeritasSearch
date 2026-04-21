"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search, Shield, AlertTriangle, CheckCircle, XCircle,
  Loader2, Sparkles, Globe, Zap, ArrowRight,
} from "lucide-react";
import EvidenceMap from "@/components/EvidenceMap";
import TrustMeter from "@/components/TrustMeter";
import type { VerificationReport, AuditResult } from "@/lib/types";

type AppState = "idle" | "loading" | "done" | "error";

const STEPS = [
  { label: "Decomposing into claims", icon: Sparkles, pct: 20 },
  { label: "Scraping sources",        icon: Globe,    pct: 50 },
  { label: "Auditing evidence",       icon: Zap,      pct: 80 },
  { label: "Generating report",       icon: Shield,   pct: 95 },
];

const SUGGESTIONS = [
  "Does coffee lower Alzheimer's risk?",
  "Is 5G radiation harmful to humans?",
  "Does vitamin C prevent the common cold?",
  "Are electric cars better for the environment?",
];

// ─── Particle canvas ──────────────────────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    type P = { ox: number; oy: number; x: number; y: number; vx: number; vy: number; r: number; a: number };

    const N   = 90;
    const pts: P[] = Array.from({ length: N }, () => {
      const ox = Math.random() * W;
      const oy = Math.random() * H;
      return { ox, oy, x: ox, y: oy, vx: 0, vy: 0, r: Math.random() * 1.6 + 0.4, a: Math.random() * 0.4 + 0.15 };
    });

    const REPEL_R = 150;
    const SPRING  = 0.032;
    const DAMP    = 0.87;
    const REPEL   = 4.2;
    const CONN_D  = 90;

    let raf = 0;

    function tick() {
      ctx.clearRect(0, 0, W, H);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < N; i++) {
        const p = pts[i];
        p.vx += (p.ox - p.x) * SPRING;
        p.vy += (p.oy - p.y) * SPRING;
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < REPEL_R * REPEL_R && d2 > 0) {
          const d = Math.sqrt(d2);
          const f = ((REPEL_R - d) / REPEL_R) * REPEL;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx *= DAMP;
        p.vy *= DAMP;
        p.x  += p.vx;
        p.y  += p.vy;
      }

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < CONN_D) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(52,211,153,${(1 - d / CONN_D) * 0.09})`;
            ctx.lineWidth   = 0.5;
            ctx.stroke();
          }
        }
      }

      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52,211,153,${p.a})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    }

    tick();

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
    };
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener("resize",     onResize);
    window.addEventListener("mousemove",  onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize",     onResize);
      window.removeEventListener("mousemove",  onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}

// ─── Loading overlay ──────────────────────────────────────────────────────────
function LoadingOverlay({ step, logs }: { step: number; logs: string[] }) {
  const pct = step >= 0 && step < STEPS.length ? STEPS[step].pct : step >= STEPS.length ? 100 : 5;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Verification in progress"
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(3,7,18,0.97)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.2s ease both",
      }}
    >
      {/* Top progress bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.04)" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, #059669, #34d399, #6ee7b7)",
            backgroundSize: "200% auto",
            animation: "shimmer 2s linear infinite",
            transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "0 0 14px rgba(52,211,153,0.7), 0 0 4px rgba(52,211,153,0.9)",
          }}
        />
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 400,
        margin: "0 16px",
        background: "rgba(13,15,26,0.98)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 22,
        padding: 32,
        boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,211,153,0.06)",
      }}>
        {/* Shield pulse */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="animate-pulse" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 52, height: 52, borderRadius: 16,
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(52,211,153,0.25)",
            marginBottom: 12,
          }}>
            <Shield style={{ width: 24, height: 24, color: "#34d399" }} />
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Verifying
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {STEPS.map((s, i) => {
            const Icon  = s.icon;
            const done  = i < step;
            const active = i === step;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done || active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${done || active ? "rgba(52,211,153,0.28)" : "rgba(255,255,255,0.06)"}`,
                  transition: "all 0.35s ease",
                }}>
                  {done   ? <CheckCircle style={{ width: 14, height: 14, color: "#34d399" }} />
                  : active ? <Loader2    className="animate-spin" style={{ width: 14, height: 14, color: "#34d399" }} />
                  :           <Icon      style={{ width: 14, height: 14, color: "#334155" }} />}
                </div>
                <span style={{
                  fontSize: 13,
                  color: done ? "#4b5563" : active ? "#f1f5f9" : "#64748b",
                  textDecoration: done ? "line-through" : "none",
                  transition: "color 0.3s ease",
                }}>
                  {s.label}
                </span>
                {active && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#10b981", fontFamily: "monospace" }}>
                    running…
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {logs.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {logs.slice(-3).map((l, i) => (
              <p key={i} style={{ fontSize: 11, color: "#334155", fontFamily: "monospace", lineHeight: 1.9 }}>
                <span style={{ color: "#059669", marginRight: 8 }}>›</span>{l}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [query,       setQuery]       = useState("");
  const [appState,    setAppState]    = useState<AppState>("idle");
  const [report,      setReport]      = useState<VerificationReport | null>(null);
  const [audit,       setAudit]       = useState<AuditResult | null>(null);
  const [step,        setStep]        = useState(-1);
  const [logs,        setLogs]        = useState<string[]>([]);
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

      if (!res.ok || !res.body) throw new Error(`Backend returned ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      let gotReport = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataLine.slice(6)); } catch { continue; }

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

  const isActive = query.trim().length > 0 && appState !== "loading";

  return (
    <div style={{ minHeight: "100dvh", background: "#030712", color: "#f1f5f9", display: "flex", flexDirection: "column" }}>
      <ParticleField />

      {appState === "loading" && <LoadingOverlay step={step} logs={logs} />}

      {/* Ambient radial glow */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 50% -5%, rgba(16,185,129,0.1) 0%, transparent 70%)",
      }} />

      <main style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "0 16px 60px",
        paddingTop: appState === "done" ? 48 : "12vh",
        position: "relative", zIndex: 1,
        transition: "padding-top 0.5s ease",
      }}>

        {/* ── Hero ── */}
        <header style={{
          textAlign: "center",
          marginBottom: appState === "done" ? 32 : 52,
          maxWidth: 640,
          transition: "margin-bottom 0.4s ease",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(16,185,129,0.07)", border: "1px solid rgba(52,211,153,0.18)",
            borderRadius: 999, padding: "5px 16px", marginBottom: 26,
            fontSize: 11, fontWeight: 600, color: "#34d399", letterSpacing: "0.09em", textTransform: "uppercase",
          }}>
            <span className="animate-pulse" style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#34d399", boxShadow: "0 0 6px #34d399",
              flexShrink: 0,
            }} />
            Phi-3.5 · SearXNG · Fully Local
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 18 }}>
            <Shield
              aria-hidden="true"
              style={{
                width: 40, height: 40, color: "#34d399", flexShrink: 0,
                filter: "drop-shadow(0 0 20px rgba(52,211,153,0.65))",
              }}
            />
            <h1 style={{
              fontSize: "clamp(2.4rem, 6vw, 3.8rem)",
              fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1, margin: 0,
              background: "linear-gradient(135deg, #34d399 0%, #a7f3d0 45%, #6ee7b7 75%, #059669 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              VeritasSearch
            </h1>
          </div>

          <p style={{ color: "#94a3b8", fontSize: 15, lineHeight: 1.75, maxWidth: 480, margin: "0 auto" }}>
            Every answer arrives with a provenance score and a full evidence chain —
            not just the model&rsquo;s best guess.
          </p>
        </header>

        {/* ── Search bar ── */}
        <div style={{ width: "100%", maxWidth: 700 }}>
          <div
            className="search-pill"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 999,
              padding: "6px 6px 6px 22px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          >
            <Search aria-hidden="true" style={{ width: 17, height: 17, color: "#334155", flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              aria-label="Enter a claim to verify"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="Ask anything — e.g. Does coffee reduce Alzheimer's risk?"
              disabled={appState === "loading"}
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#f1f5f9", fontSize: 15, padding: "11px 4px",
                caretColor: "#34d399",
              }}
            />
            <button
              onClick={handleVerify}
              disabled={!isActive}
              className="verify-btn"
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: isActive ? "#10b981" : "rgba(255,255,255,0.04)",
                color: isActive ? "#030712" : "#334155",
                border: "none", borderRadius: 999,
                padding: "11px 24px", fontSize: 14, fontWeight: 700,
                cursor: isActive ? "pointer" : "not-allowed",
                transition: "all 0.2s ease",
                minWidth: 108, justifyContent: "center", flexShrink: 0,
              }}
            >
              {appState === "loading"
                ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
                : <ArrowRight style={{ width: 15, height: 15 }} />
              }
              {appState === "loading" ? "Running…" : "Verify"}
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "#475569", marginTop: 10 }}>
            Press{" "}
            <span style={{ color: "#64748b", fontFamily: "monospace" }}>↵ Enter</span>
            {" "}to verify &nbsp;·&nbsp; Results include full evidence chain
          </p>
        </div>

        {/* ── Error ── */}
        {appState === "error" && (
          <div
            role="alert"
            className="animate-fade-slide-up"
            style={{
              marginTop: 28, width: "100%", maxWidth: 700,
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)",
              borderRadius: 18, padding: "18px 22px",
              display: "flex", gap: 14,
            }}
          >
            <XCircle style={{ width: 18, height: 18, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#fca5a5", marginBottom: 5 }}>Verification failed</p>
              {streamError && (
                <p style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{streamError}</p>
              )}
              <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                Make sure the backend (port 8000) and SearXNG (port 8888) are running.
              </p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {appState === "done" && report && (
          <section
            aria-label="Verification results"
            className="animate-fade-slide-up"
            style={{ marginTop: 40, width: "100%", maxWidth: 960, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {/* Trust + Answer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20, padding: "28px 24px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
              }}>
                <TrustMeter score={report.trust_score ?? 0} />
                {report.has_conflicts && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.22)",
                    borderRadius: 999, padding: "4px 12px",
                    fontSize: 11, fontWeight: 600, color: "#fbbf24",
                  }}>
                    <AlertTriangle style={{ width: 11, height: 11 }} />
                    Sources conflict
                  </div>
                )}
                <p style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>
                  {report.source_count ?? 0} sources
                  {(audit?.verdicts?.length ?? 0) > 0 ? ` · ${audit!.verdicts.length} claims` : ""}
                </p>
              </div>

              <div className="md:col-span-2" style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20, padding: "28px 28px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <Sparkles style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Synthesised Answer
                  </span>
                </div>
                <p style={{ color: "#e2e8f0", lineHeight: 1.8, fontSize: 14, whiteSpace: "pre-wrap" }}>
                  {report.answer}
                </p>
              </div>
            </div>

            {/* Claim audit */}
            {(audit?.verdicts?.length ?? 0) > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20, padding: "28px 28px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <Shield style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Claim Audit
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {audit!.verdicts.map((v) => {
                    const controversial = v.is_controversial;
                    const supported     = !controversial && (v.consensus_score ?? 0) >= 0.6;
                    return (
                      <div
                        key={v.claim_id}
                        style={{
                          borderRadius: 14, padding: "14px 16px",
                          background: controversial
                            ? "rgba(245,158,11,0.04)"
                            : supported
                            ? "rgba(16,185,129,0.04)"
                            : "rgba(255,255,255,0.02)",
                          border: `1px solid ${controversial
                            ? "rgba(245,158,11,0.18)"
                            : supported
                            ? "rgba(16,185,129,0.18)"
                            : "rgba(255,255,255,0.05)"}`,
                        }}
                      >
                        <div style={{ display: "flex", gap: 12 }}>
                          {controversial
                            ? <AlertTriangle style={{ width: 14, height: 14, color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
                            : supported
                            ? <CheckCircle  style={{ width: 14, height: 14, color: "#34d399",  flexShrink: 0, marginTop: 2 }} />
                            : <XCircle     style={{ width: 14, height: 14, color: "#334155",  flexShrink: 0, marginTop: 2 }} />
                          }
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.65 }}>{v.claim_text}</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.05)", borderRadius: 7, padding: "2px 9px", color: "#94a3b8" }}>
                                Consensus <strong style={{ color: "#e2e8f0" }}>{((v.consensus_score ?? 0) * 100).toFixed(0)}%</strong>
                              </span>
                              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.05)", borderRadius: 7, padding: "2px 9px", color: "#94a3b8" }}>
                                S_p <strong style={{ color: "#e2e8f0" }}>{((v.provenance_score ?? 0) * 100).toFixed(0)}</strong>
                              </span>
                              {(v.supports?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "#34d399", fontWeight: 600 }}>{v.supports.length} support</span>
                              )}
                              {(v.refutes?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>{v.refutes.length} refute</span>
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
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20, padding: "28px 28px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <Globe style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Evidence Map
                  </span>
                </div>
                <EvidenceMap verdicts={audit!.verdicts} />
              </div>
            )}
          </section>
        )}

        {/* ── Suggestions ── */}
        {appState === "idle" && (
          <div className="animate-fade-in" style={{ marginTop: 52, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
              Try asking
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 580, margin: "0 auto" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                  className="suggestion-chip"
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                    color: "#94a3b8", background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999,
                    padding: "8px 16px", cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <ArrowRight style={{ width: 11, height: 11 }} />
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
