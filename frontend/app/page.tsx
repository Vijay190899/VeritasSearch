"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search, Shield, AlertTriangle, CheckCircle, XCircle,
  Loader2, Globe, Zap, ArrowRight, Sparkles, Maximize2, X, ExternalLink,
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

// ─── 3-D triangle-particle sphere — Dala-style, cursor-scatter ───────────────
const SPHERE_COLORS: [number, number, number][] = [
  [52,  211, 153],  // emerald
  [255, 184, 41],   // gold
  [146, 106, 255],  // violet
  [255, 255, 255],  // white
  [24,  155, 129],  // teal
  [99,  102, 241],  // indigo
];

function BrainSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef({ x: -99999, y: -99999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    // ── Build Fibonacci sphere ─────────────────────────────────────────────
    const N      = 700;
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));

    type Pt = {
      ox: number; oy: number; oz: number;   // unit sphere position (fixed)
      dx: number; dy: number; dz: number;   // displacement (scatter)
      vx: number; vy: number; vz: number;   // velocity of displacement
      color: [number, number, number];
      rot: number;
      rotSpd: number;
      sz: number;
    };

    const pts: Pt[] = Array.from({ length: N }, (_, i) => {
      // Unit sphere via Fibonacci lattice
      const uy  = 1 - (i / (N - 1)) * 2;
      const r0  = Math.sqrt(Math.max(0, 1 - uy * uy));
      const phi = GOLDEN * i;
      const ux  = Math.cos(phi) * r0;
      const uz  = Math.sin(phi) * r0;

      // ── Brain deformation ────────────────────────────────────────
      // 1. Strong ellipsoid: wide left-right, clearly flatter top-bottom
      let bx = ux * 1.55;
      let by = uy * 0.60;
      let bz = uz * 0.88;

      // 2. Deep longitudinal fissure — wide enough to visually separate two lobes
      const groove = Math.exp(-ux * ux * 22) * Math.max(0, uy) * 1.25;
      by -= groove * 0.62;                                  // pull top-center down sharply
      bx += (ux >= 0 ? 1 : -1) * groove * 0.18;           // push each lobe outward

      // 3. Two-lobe bulge — hemispheres swell above and outward
      const lobeOff   = Math.abs(ux) - 0.44;
      const lobeBulge = Math.exp(-lobeOff * lobeOff * 7) * Math.max(0, uy) * 0.28;
      by += lobeBulge;

      // 4. Flatten the crown (top of each lobe is slightly rounded, not pointy)
      const crownFlatten = Math.exp(-Math.pow(uy - 0.55, 2) * 18) * 0.12;
      by -= crownFlatten;

      // 5. Flatten bottom (brain stem/cerebellum region — not a full sphere)
      if (uy < -0.35) by += (-uy - 0.35) * 0.30;

      // 6. Wrinkle noise (gyri) — asymmetric so each lobe looks distinct
      const bump = (
        Math.sin(ux * 13 + uz * 3) * Math.cos(uy * 10) * 0.048
        + Math.sin(ux * 7 - uz * 9) * Math.sin(uy * 6) * 0.028
      );
      const len  = Math.sqrt(bx * bx + by * by + bz * bz);
      if (len > 0) { bx += (bx / len) * bump; by += (by / len) * bump; bz += (bz / len) * bump; }
      // ─────────────────────────────────────────────────────────────

      return {
        ox: bx, oy: by, oz: bz,
        dx: 0, dy: 0, dz: 0,
        vx: 0, vy: 0, vz: 0,
        color: SPHERE_COLORS[i % SPHERE_COLORS.length],
        rot:    Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.05,
        sz:     Math.random() * 4 + 2.5,
      };
    });

    const FOV    = 520;
    const SPRING = 0.042;
    const DAMP   = 0.83;
    const SCT_R  = 180;   // screen-space scatter radius (px)
    const SCT_F  = 0.06;  // scatter impulse strength

    let rotY = 0;
    let raf  = 0;

    // Scroll-explosion state (local to this effect closure)
    let scrollImp   = 0;
    let lastScrollY = window.scrollY;

    function tick() {
      // Decay and apply outward scroll impulse
      if (scrollImp > 0.002) {
        for (const p of pts) {
          const ml = Math.sqrt(p.ox * p.ox + p.oy * p.oy + p.oz * p.oz);
          if (ml > 0) {
            p.vx += (p.ox / ml) * scrollImp;
            p.vy += (p.oy / ml) * scrollImp;
            p.vz += (p.oz / ml) * scrollImp;
          }
        }
        scrollImp *= 0.86;
      }
      ctx.clearRect(0, 0, W, H);

      rotY += 0.0025;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      // Sphere lives on the right ~60% horizontally
      const cx = W * 0.64;
      const cy = H * 0.44;
      const R  = Math.min(W, H) * 0.30;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // ── Physics + project ────────────────────────────────────────────────
      type Proj = { sx: number; sy: number; sz: number; depth: number; pt: Pt };
      const projected: Proj[] = pts.map(p => {
        // Spring back displacement
        p.vx += (-p.dx * SPRING); p.vy += (-p.dy * SPRING); p.vz += (-p.dz * SPRING);
        p.vx *= DAMP; p.vy *= DAMP; p.vz *= DAMP;
        p.dx += p.vx;  p.dy += p.vy;  p.dz += p.vz;
        p.rot += p.rotSpd;

        // Rotate base position around Y axis
        const rx = p.ox * cosY - p.oz * sinY;
        const ry = p.oy;
        const rz = p.ox * sinY + p.oz * cosY;

        // Add displacement
        const wx = rx + p.dx;
        const wy = ry + p.dy;
        const wz = rz + p.dz;

        // Perspective project
        const scale = FOV / (FOV + wz * R * 0.4);
        const sx    = cx + wx * R * scale;
        const sy    = cy + wy * R * scale;

        // Mouse scatter — push radially from sphere surface
        const ddx = sx - mx;
        const ddy = sy - my;
        const dd  = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < SCT_R && dd > 0) {
          const f = ((SCT_R - dd) / SCT_R) * SCT_F;
          p.vx += rx * f;
          p.vy += ry * f;
          p.vz += rz * f;
        }

        return { sx, sy, sz: scale, depth: wz, pt: p };
      });

      // Depth sort back-to-front
      projected.sort((a, b) => a.depth - b.depth);

      // ── Draw triangles ────────────────────────────────────────────────────
      for (const { sx, sy, sz, depth, pt } of projected) {
        const alpha = Math.max(0.15, (depth + 1.9) / 2.8);
        const size  = pt.sz * sz;
        const [r, g, b] = pt.color;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(pt.rot);
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo( size * 0.866,  size * 0.5);
        ctx.lineTo(-size * 0.866,  size * 0.5);
        ctx.closePath();
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth   = 0.7;
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    }

    tick();

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    const onMouseMove  = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onMouseLeave = () => { mouseRef.current = { x: -99999, y: -99999 }; };
    const onScroll     = () => {
      const delta = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      if (delta > 1) scrollImp = Math.min(scrollImp + delta * 0.016, 0.45);
    };

    window.addEventListener("resize",     onResize);
    window.addEventListener("mousemove",  onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll",     onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize",     onResize);
      window.removeEventListener("mousemove",  onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll",     onScroll);
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

// ─── Soft ambient orbs that drift with the cursor ─────────────────────────────
function AmbientOrbs() {
  const aRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let tx = window.innerWidth * 0.5, ty = window.innerHeight * 0.4;
    let ax = tx, ay = ty;
    let raf = 0;

    function tick() {
      ax += (tx - ax) * 0.035; ay += (ty - ay) * 0.035;
      if (aRef.current) aRef.current.style.transform = `translate(${ax - 600}px, ${ay - 600}px)`;
      raf = requestAnimationFrame(tick);
    }
    tick();
    const mv = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; };
    window.addEventListener("mousemove", mv);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", mv); };
  }, []);

  return (
    <div ref={aRef} aria-hidden="true" style={{
      position: "fixed", top: 0, left: 0, zIndex: 0, pointerEvents: "none",
      width: 1200, height: 1200, borderRadius: "50%",
      background: "radial-gradient(circle at center, rgba(16,185,129,0.28) 0%, rgba(52,211,153,0.12) 35%, rgba(99,102,241,0.15) 60%, transparent 75%)",
      filter: "blur(70px)",
      willChange: "transform",
    }} />
  );
}

// ─── SVG fractal-noise grain — same technique as dala.craftedbygc.com ─────────
function GrainOverlay() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2,
        width: "100%", height: "100%",
        pointerEvents: "none", opacity: 0.055,
      }}
    >
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

// ─── Inline loading card (sphere stays visible behind it) ────────────────────
function LoadingCard({ step, logs }: { step: number; logs: string[] }) {
  const pct = step >= 0 && step < STEPS.length ? STEPS[step].pct : step >= STEPS.length ? 100 : 5;
  return (
    <>
      {/* Slim top progress bar — z-index 10 so it floats above main content */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 10, background: "rgba(255,255,255,0.04)" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg, #059669, #34d399, #6ee7b7)",
          backgroundSize: "200% auto",
          animation: "shimmer 2s linear infinite",
          transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "0 0 14px rgba(52,211,153,0.8)",
        }} />
      </div>

      {/* Inline card — sits in normal flow so the canvas sphere shows behind */}
      <div
        role="status" aria-live="polite" aria-label="Verification in progress"
        className="animate-fade-in"
        style={{
          marginTop: 32, width: "100%", maxWidth: 400,
          background: "rgba(5,8,20,0.78)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(52,211,153,0.15)",
          borderRadius: 22, padding: "28px 32px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(52,211,153,0.04)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="animate-pulse" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 48, height: 48, borderRadius: 14,
            background: "rgba(16,185,129,0.14)", border: "1px solid rgba(52,211,153,0.28)",
            marginBottom: 10,
          }}>
            <Shield style={{ width: 22, height: 22, color: "#34d399" }} />
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Verifying
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {STEPS.map((s, i) => {
            const Icon   = s.icon;
            const done   = i < step;
            const active = i === step;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done || active ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${done || active ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.06)"}`,
                  transition: "all 0.35s ease",
                }}>
                  {done    ? <CheckCircle style={{ width: 14, height: 14, color: "#34d399" }} />
                  : active  ? <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: "#34d399" }} />
                  :            <Icon style={{ width: 14, height: 14, color: "#334155" }} />}
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
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {logs.slice(-3).map((l, i) => (
              <p key={i} style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", lineHeight: 1.9 }}>
                <span style={{ color: "#059669", marginRight: 8 }}>›</span>{l}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [query,        setQuery]       = useState("");
  const [appState,     setAppState]    = useState<AppState>("idle");
  const [report,       setReport]      = useState<VerificationReport | null>(null);
  const [audit,        setAudit]       = useState<AuditResult | null>(null);
  const [step,         setStep]        = useState(-1);
  const [logs,         setLogs]        = useState<string[]>([]);
  const [streamError,  setStreamError] = useState<string | null>(null);
  const [mapExpanded,  setMapExpanded] = useState(false);
  const [mapZoom,      setMapZoom]     = useState(1);
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
      {/* Background layer stack */}
      <BrainSphere />
      <AmbientOrbs />
      <GrainOverlay />

      <main style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "0 16px 80px",
        paddingTop: appState === "done" ? 48 : "12vh",
        position: "relative", zIndex: 3,
        transition: "padding-top 0.5s ease",
      }}>

        {/* ── Hero ── */}
        <header style={{
          textAlign: "center",
          marginBottom: appState === "done" ? 32 : 56,
          maxWidth: 640,
          transition: "margin-bottom 0.4s ease",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(16,185,129,0.08)", border: "1px solid rgba(52,211,153,0.2)",
            borderRadius: 999, padding: "5px 16px", marginBottom: 28,
            fontSize: 11, fontWeight: 600, color: "#34d399", letterSpacing: "0.09em", textTransform: "uppercase",
          }}>
            <span className="animate-pulse" style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#34d399", boxShadow: "0 0 6px #34d399", flexShrink: 0,
            }} />
            Phi-3.5 · SearXNG · Fully Local
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 }}>
            <Shield
              aria-hidden="true"
              style={{
                width: 42, height: 42, color: "#34d399", flexShrink: 0,
                filter: "drop-shadow(0 0 22px rgba(52,211,153,0.7))",
              }}
            />
            <h1 style={{
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1, margin: 0,
              background: "linear-gradient(135deg, #34d399 0%, #a7f3d0 45%, #6ee7b7 75%, #059669 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              VeritasSearch
            </h1>
          </div>

          <p style={{ color: "#94a3b8", fontSize: 15, lineHeight: 1.8, maxWidth: 500, margin: "0 auto" }}>
            Multi-source consensus verification — every answer backed by a provenance
            score and an auditable evidence chain.
          </p>
        </header>

        {/* ── Search bar ── */}
        <div style={{ width: "100%", maxWidth: 700 }}>
          <div
            className="search-pill"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "6px 6px 6px 22px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
          >
            <Search aria-hidden="true" style={{ width: 17, height: 17, color: "#475569", flexShrink: 0 }} />
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
                background: isActive ? "#10b981" : "rgba(255,255,255,0.05)",
                color: isActive ? "#030712" : "#475569",
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
            Press <span style={{ color: "#64748b", fontFamily: "monospace" }}>↵ Enter</span> to verify
            &nbsp;·&nbsp; Results include full evidence chain
          </p>
        </div>

        {/* ── Loading card (inline so sphere stays visible) ── */}
        {appState === "loading" && <LoadingCard step={step} logs={logs} />}

        {/* ── Error ── */}
        {appState === "error" && (
          <div
            role="alert"
            className="animate-fade-slide-up"
            style={{
              marginTop: 28, width: "100%", maxWidth: 700,
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
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
            style={{ marginTop: 48, width: "100%", maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {/* ── Direct Answer card ── */}
            {report.answer && (report.trust_score ?? 0) > 0 && (
              <div style={{
                background: "rgba(16,185,129,0.07)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: 20, padding: "22px 28px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <CheckCircle style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Direct Answer
                  </span>
                </div>
                {/* Short one-liner */}
                <p style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.5, margin: 0 }}>
                  {report.short_answer ?? report.answer.split(/(?<=[.!?])\s+/)[0]}
                </p>
                {/* Full answer expandable below if it has more content */}
                {report.answer.length > (report.short_answer ?? "").length + 5 && (
                  <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, marginTop: 10 }}>
                    {report.answer}
                  </p>
                )}
              </div>
            )}

            {/* ── Error / no-evidence message ── */}
            {(report.trust_score ?? 0) === 0 && report.answer && (
              <div style={{
                background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: 16, padding: "16px 20px",
              }}>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{report.answer}</p>
              </div>
            )}

            {/* ── Trust score hero ── */}
            <div style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 24, padding: "36px 28px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            }}>
              <TrustMeter score={report.trust_score ?? 0} />

              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 }}>
                {report.has_conflicts && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.22)",
                    borderRadius: 999, padding: "5px 14px",
                    fontSize: 11, fontWeight: 600, color: "#fbbf24",
                  }}>
                    <AlertTriangle style={{ width: 11, height: 11 }} />
                    Sources conflict
                  </div>
                )}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 999, padding: "5px 14px",
                  fontSize: 11, color: "#64748b",
                }}>
                  {report.source_count ?? 0} sources
                  {(audit?.verdicts?.length ?? 0) > 0 ? ` · ${audit!.verdicts.length} claims` : ""}
                </div>
              </div>
            </div>

            {/* Claim audit */}
            {(audit?.verdicts?.length ?? 0) > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.1)",
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
                            ? "rgba(245,158,11,0.05)"
                            : supported
                            ? "rgba(16,185,129,0.05)"
                            : "rgba(255,255,255,0.02)",
                          border: `1px solid ${controversial
                            ? "rgba(245,158,11,0.2)"
                            : supported
                            ? "rgba(16,185,129,0.2)"
                            : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        <div style={{ display: "flex", gap: 12 }}>
                          {controversial
                            ? <AlertTriangle style={{ width: 14, height: 14, color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
                            : supported
                            ? <CheckCircle  style={{ width: 14, height: 14, color: "#34d399",  flexShrink: 0, marginTop: 2 }} />
                            : <XCircle     style={{ width: 14, height: 14, color: "#475569",  flexShrink: 0, marginTop: 2 }} />
                          }
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.65 }}>{v.claim_text}</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "2px 9px", color: "#94a3b8" }}>
                                Consensus <strong style={{ color: "#e2e8f0" }}>{((v.consensus_score ?? 0) * 100).toFixed(0)}%</strong>
                              </span>
                              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "2px 9px", color: "#94a3b8" }}>
                                S_p <strong style={{ color: "#e2e8f0" }}>{((v.provenance_score ?? 0) * 100).toFixed(0)}</strong>
                              </span>
                              {(v.supports?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "#34d399", fontWeight: 600 }}>{v.supports.length} supporting</span>
                              )}
                              {(v.refutes?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>{v.refutes.length} refuting</span>
                              )}
                            </div>
                            {/* Top source links */}
                            {(v.top_sources?.length ?? 0) > 0 && (
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                <p style={{ fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                                  Sources
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                  {v.top_sources!.map((src, si) => (
                                    <a
                                      key={si}
                                      href={src.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: "flex", alignItems: "flex-start", gap: 7,
                                        fontSize: 12, color: "#6ee7b7", textDecoration: "none",
                                        background: "rgba(52,211,153,0.04)",
                                        border: "1px solid rgba(52,211,153,0.12)",
                                        borderRadius: 8, padding: "6px 10px",
                                        transition: "background 0.15s",
                                      }}
                                      title={src.url}
                                    >
                                      <ExternalLink style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
                                      <span style={{ lineHeight: 1.4 }}>
                                        <span style={{ display: "block", fontWeight: 600, color: "#a7f3d0" }}>
                                          {src.title && src.title !== src.domain ? src.title.slice(0, 72) : src.domain}
                                        </span>
                                        <span style={{ fontSize: 10, color: "#475569" }}>{src.domain}</span>
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
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
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20, padding: "28px 28px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <Globe style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Evidence Map
                  </span>
                  <button
                    onClick={() => setMapExpanded(true)}
                    title="Expand to fullscreen"
                    style={{
                      marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8, padding: "4px 10px", cursor: "pointer",
                      fontSize: 11, color: "#64748b",
                    }}
                  >
                    <Maximize2 style={{ width: 11, height: 11 }} />
                    Expand
                  </button>
                </div>
                <EvidenceMap verdicts={audit!.verdicts} />
              </div>
            )}

            {/* Fullscreen Evidence Map overlay with zoom */}
            {mapExpanded && (audit?.verdicts?.length ?? 0) > 0 && (
              <div
                style={{
                  position: "fixed", inset: 0, zIndex: 50,
                  background: "rgba(3,7,18,0.94)",
                  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                  display: "flex", flexDirection: "column",
                  padding: "24px 28px",
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexShrink: 0 }}>
                  <Globe style={{ width: 14, height: 14, color: "#34d399" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Evidence Map
                  </span>

                  {/* Zoom controls */}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => setMapZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                      style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Zoom out"
                    >−</button>
                    <span style={{ fontSize: 11, color: "#64748b", minWidth: 36, textAlign: "center", fontFamily: "monospace" }}>
                      {Math.round(mapZoom * 100)}%
                    </span>
                    <button
                      onClick={() => setMapZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
                      style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Zoom in"
                    >+</button>
                    <button
                      onClick={() => { setMapExpanded(false); setMapZoom(1); }}
                      style={{
                        marginLeft: 8, display: "flex", alignItems: "center", gap: 5,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                        fontSize: 12, color: "#94a3b8",
                      }}
                    >
                      <X style={{ width: 13, height: 13 }} />
                      Close
                    </button>
                  </div>
                </div>

                {/* Scrollable zoomed canvas */}
                <div style={{ flex: 1, overflow: "auto" }}>
                  <div style={{ zoom: mapZoom, transformOrigin: "top left" }}>
                    <EvidenceMap verdicts={audit!.verdicts} />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Suggestions ── */}
        {appState === "idle" && (
          <div className="animate-fade-in" style={{ marginTop: 56, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 18 }}>
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
