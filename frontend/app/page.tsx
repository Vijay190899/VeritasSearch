"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search, Shield, AlertTriangle, CheckCircle, XCircle,
  Loader2, Globe, Zap, ArrowRight, Sparkles, ExternalLink,
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

// ─── Particle system: Brain ↔ Light-bulb on scroll ───────────────────────────
const PT_COLORS: [number, number, number][] = [
  [52,  211, 153],  // emerald
  [139,  92, 246],  // violet
  [236,  72, 153],  // pink
  [250, 204,  21],  // gold
  [56,  189, 248],  // sky
  [255, 255, 255],  // white
];

// ── Anatomy-based brain deformation ──────────────────────────────────────────
function brainPos(ux: number, uy: number, uz: number): [number, number, number] {
  // Human brain: ~14cm wide, 9cm tall, 14cm front-back
  let bx = ux * 1.52;
  let by = uy * 0.64;
  let bz = uz * 1.38;

  // Deep longitudinal fissure at x≈0 across entire upper half
  const absX = Math.abs(ux);
  const topHalf = Math.max(0, uy);
  const fissure = Math.max(0, 1 - absX / 0.28) * topHalf;
  by -= fissure * 0.65;
  bx += (ux >= 0 ? 1 : -1) * fissure * 0.20;

  // Each hemisphere bulges upward at |ux|≈0.50
  const hOff   = Math.abs(ux) - 0.50;
  const hBulge = Math.exp(-hOff * hOff * 5.5) * Math.max(0, uy + 0.2) * 0.32;
  by += hBulge;

  // Crown slight flatten
  if (uy > 0.65) by -= (uy - 0.65) * 0.20;

  // Temporal lobe extension: widens at mid-height sides
  const tempH = Math.abs(uy + 0.12);
  if (tempH < 0.38 && absX > 0.25) {
    const tExt = Math.exp(-tempH * tempH * 18) * (absX - 0.25) * 0.28;
    bx += (ux >= 0 ? 1 : -1) * tExt;
  }

  // Brainstem / bottom narrows
  if (uy < -0.42) {
    const bf = (-uy - 0.42) * 1.5;
    by  += bf * 0.28;
    bx  *= Math.max(0.38, 1 - bf * 0.40);
    bz  *= Math.max(0.45, 1 - bf * 0.30);
  }

  // Multi-scale gyri wrinkles
  const bump =
    Math.sin(ux * 14 + uz * 5) * Math.cos(uy * 11) * 0.044 +
    Math.sin(ux *  7 - uz * 11) * Math.sin(uy * 8 + uz * 4) * 0.026 +
    Math.cos(ux * 11 + uy *  5) * Math.sin(uz * 9) * 0.018;
  const L = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
  return [bx + (bx / L) * bump, by + (by / L) * bump, bz + (bz / L) * bump];
}

// ── Light-bulb shape (sphere top + tapered neck) ──────────────────────────────
function bulbPos(ux: number, uy: number, uz: number): [number, number, number] {
  if (uy >= -0.55) {
    const taper = uy < -0.10 ? 1 - (-uy - 0.10) * 0.50 : 1.0;
    return [ux * 0.98 * taper, uy * 0.90 + 0.08, uz * 0.98 * taper];
  }
  const angle = Math.atan2(uz, ux);
  const t = Math.min(1, (-uy - 0.55) / 0.45);
  const r = 0.26 - t * 0.08;
  const y = -0.52 - t * 0.55;
  const ridgeR = r + Math.sin(t * 14) * 0.015;
  return [Math.cos(angle) * ridgeR, y, Math.sin(angle) * ridgeR];
}

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

    const N      = 700;
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));

    type Pt = {
      ox: number; oy: number; oz: number;
      dx: number; dy: number; dz: number;
      vx: number; vy: number; vz: number;
      color: [number, number, number];
      rot: number; rotSpd: number; sz: number;
      bi: number;
    };

    const brainTargets: [number, number, number][] = [];
    const bulbTargets:  [number, number, number][] = [];

    for (let i = 0; i < N; i++) {
      const uy  = 1 - (i / (N - 1)) * 2;
      const r0  = Math.sqrt(Math.max(0, 1 - uy * uy));
      const phi = GOLDEN * i;
      brainTargets.push(brainPos(Math.cos(phi) * r0, uy, Math.sin(phi) * r0));
      bulbTargets.push(bulbPos(Math.cos(phi) * r0, uy, Math.sin(phi) * r0));
    }

    const pts: Pt[] = Array.from({ length: N }, (_, i) => {
      const [bx, by, bz] = brainTargets[i];
      return {
        ox: bx, oy: by, oz: bz,
        dx: 0, dy: 0, dz: 0,
        vx: 0, vy: 0, vz: 0,
        color: PT_COLORS[i % PT_COLORS.length],
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.05,
        sz: Math.random() * 4 + 2.5,
        bi: i,
      };
    });

    const FOV    = 520;
    const SPRING = 0.018;  // slow spring → gradual reformation
    const DAMP   = 0.87;
    const SCT_R  = 180;
    const SCT_F  = 0.06;

    let rotY  = 0;
    let raf   = 0;
    let shape: "brain" | "bulb" = "brain";

    function explode(toBrain: boolean) {
      const targets = toBrain ? brainTargets : bulbTargets;
      const IMP = 0.75;
      for (const p of pts) {
        const ml = Math.sqrt(p.ox * p.ox + p.oy * p.oy + p.oz * p.oz) || 1;
        const r = 0.35 + Math.random() * 0.65;
        p.vx += (p.ox / ml) * IMP * r;
        p.vy += (p.oy / ml) * IMP * r;
        p.vz += (p.oz / ml) * IMP * r;
        const [tx, ty, tz] = targets[p.bi];
        p.ox = tx; p.oy = ty; p.oz = tz;
      }
    }

    const SCROLL_DOWN = 280;
    const SCROLL_UP   = 80;
    const onScroll = () => {
      const sy = window.scrollY;
      if (sy > SCROLL_DOWN && shape === "brain") {
        shape = "bulb";
        explode(false);
      } else if (sy < SCROLL_UP && shape === "bulb") {
        shape = "brain";
        explode(true);
      }
    };

    function tick() {
      ctx.clearRect(0, 0, W, H);
      rotY += 0.0022;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      const cx = W * 0.64;
      const cy = H * 0.44;
      const R  = Math.min(W, H) * 0.30;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      type Proj = { sx: number; sy: number; sz: number; depth: number; pt: Pt };
      const projected: Proj[] = pts.map(p => {
        p.vx += -p.dx * SPRING; p.vy += -p.dy * SPRING; p.vz += -p.dz * SPRING;
        p.vx *= DAMP; p.vy *= DAMP; p.vz *= DAMP;
        p.dx += p.vx; p.dy += p.vy; p.dz += p.vz;
        p.rot += p.rotSpd;

        const rx = p.ox * cosY - p.oz * sinY;
        const ry = p.oy;
        const rz = p.ox * sinY + p.oz * cosY;
        const wx = rx + p.dx, wy = ry + p.dy, wz = rz + p.dz;

        const scale = FOV / (FOV + wz * R * 0.4);
        const sx    = cx + wx * R * scale;
        const sy2   = cy + wy * R * scale;

        const ddx = sx - mx, ddy = sy2 - my;
        const dd  = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < SCT_R && dd > 0) {
          const f = ((SCT_R - dd) / SCT_R) * SCT_F;
          p.vx += rx * f; p.vy += ry * f; p.vz += rz * f;
        }
        return { sx, sy: sy2, sz: scale, depth: wz, pt: p };
      });

      projected.sort((a, b) => a.depth - b.depth);

      for (const { sx, sy, sz, depth, pt } of projected) {
        const alpha = Math.max(0.10, (depth + 2.1) / 3.0);
        const size  = pt.sz * sz;
        const [r, g, b] = pt.color;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(pt.rot);
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.866, size * 0.5);
        ctx.lineTo(-size * 0.866, size * 0.5);
        ctx.closePath();
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 0.65;
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    }

    tick();

    const onResize    = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; };
    const onMouseMove  = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onMouseLeave = () => { mouseRef.current = { x: -99999, y: -99999 }; };

    window.addEventListener("resize",    onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll",    onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize",    onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll",    onScroll);
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

// ─── Ambient orbs ─────────────────────────────────────────────────────────────
function AmbientOrbs() {
  const aRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let tx = window.innerWidth * 0.5, ty = window.innerHeight * 0.4;
    let ax = tx, ay = ty;
    let raf = 0;
    function tick() {
      ax += (tx - ax) * 0.032; ay += (ty - ay) * 0.032;
      if (aRef.current) aRef.current.style.transform = `translate(${ax - 650}px, ${ay - 650}px)`;
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
      width: 1300, height: 1300, borderRadius: "50%",
      background: "radial-gradient(circle at center, rgba(16,185,129,0.22) 0%, rgba(99,102,241,0.14) 40%, rgba(139,92,246,0.10) 60%, transparent 72%)",
      filter: "blur(80px)",
      willChange: "transform",
    }} />
  );
}

// ─── Grain overlay ────────────────────────────────────────────────────────────
function GrainOverlay() {
  return (
    <svg aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 2, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.048 }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

// ─── Loading card ─────────────────────────────────────────────────────────────
function LoadingCard({ step, logs }: { step: number; logs: string[] }) {
  const pct = step >= 0 && step < STEPS.length ? STEPS[step].pct : step >= STEPS.length ? 100 : 5;
  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 10, background: "rgba(255,255,255,0.04)" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg, #059669, #34d399, #6ee7b7)",
          transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "0 0 14px rgba(52,211,153,0.8)",
        }} />
      </div>
      <div
        role="status" aria-live="polite" className="animate-fade-in"
        style={{
          marginTop: 32, width: "100%", maxWidth: 400,
          background: "rgba(4,9,22,0.82)",
          backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
          border: "1px solid rgba(99,102,241,0.18)",
          borderRadius: 22, padding: "28px 32px",
          boxShadow: "0 32px 72px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,211,153,0.04)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="animate-pulse" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 48, height: 48, borderRadius: 14,
            background: "rgba(16,185,129,0.12)", border: "1px solid rgba(52,211,153,0.25)",
            marginBottom: 10,
          }}>
            <Shield style={{ width: 22, height: 22, color: "#34d399" }} />
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Verifying
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step, active = i === step;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: done || active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${done || active ? "rgba(52,211,153,0.28)" : "rgba(255,255,255,0.06)"}`,
                  transition: "all 0.35s ease",
                }}>
                  {done   ? <CheckCircle style={{ width: 14, height: 14, color: "#34d399" }} />
                  : active ? <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: "#34d399" }} />
                  :          <Icon style={{ width: 14, height: 14, color: "#334155" }} />}
                </div>
                <span style={{ fontSize: 13, color: done ? "#4b5563" : active ? "#f1f5f9" : "#475569", textDecoration: done ? "line-through" : "none", transition: "color 0.3s" }}>
                  {s.label}
                </span>
                {active && <span style={{ marginLeft: "auto", fontSize: 11, color: "#10b981", fontFamily: "monospace" }}>running…</span>}
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
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", gotReport = false;
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
            if (rpt && typeof rpt === "object") { setReport(rpt); setStep(4); setAppState("done"); }
          }
        }
      }
      if (!gotReport) { setStreamError("Pipeline completed without a result — check the backend logs."); setAppState("error"); }
    } catch (err) {
      console.error(err);
      setStreamError(err instanceof Error ? err.message : "Unknown error");
      setAppState("error");
    }
  }, [query]);

  const isActive = query.trim().length > 0 && appState !== "loading";

  // Card and section styles — premium deep-blue dark theme
  const card = {
    background: "rgba(5,11,26,0.88)",
    border: "1px solid rgba(99,102,241,0.14)",
    borderRadius: 20,
  } as const;

  return (
    <div style={{
      minHeight: "100dvh",
      background: "radial-gradient(ellipse at 18% 22%, #0a1628 0%, #030b18 55%, #020810 100%)",
      color: "#f1f5f9",
      display: "flex", flexDirection: "column",
    }}>
      <BrainSphere />
      <AmbientOrbs />
      <GrainOverlay />

      <main style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "0 16px 80px",
        paddingTop: appState === "done" ? 40 : "11vh",
        position: "relative", zIndex: 3,
        transition: "padding-top 0.5s ease",
      }}>

        {/* ── Hero ── */}
        <header style={{ textAlign: "center", marginBottom: appState === "done" ? 28 : 52, maxWidth: 640, transition: "margin-bottom 0.4s ease" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(16,185,129,0.07)", border: "1px solid rgba(52,211,153,0.18)",
            borderRadius: 999, padding: "5px 16px", marginBottom: 26,
            fontSize: 11, fontWeight: 600, color: "#34d399", letterSpacing: "0.09em", textTransform: "uppercase",
          }}>
            <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399", flexShrink: 0 }} />
            Phi-3.5 · SearXNG · Fully Local
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 18 }}>
            <Shield aria-hidden="true" style={{ width: 40, height: 40, color: "#34d399", flexShrink: 0, filter: "drop-shadow(0 0 24px rgba(52,211,153,0.65))" }} />
            <h1 style={{
              fontSize: "clamp(2.4rem, 6vw, 3.8rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1, margin: 0,
              background: "linear-gradient(135deg, #34d399 0%, #a7f3d0 40%, #818cf8 80%, #c084fc 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              VeritasSearch
            </h1>
          </div>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.75, maxWidth: 480, margin: "0 auto" }}>
            Multi-source consensus verification — every answer backed by a provenance score and an auditable evidence chain.
          </p>
        </header>

        {/* ── Search bar ── */}
        <div style={{ width: "100%", maxWidth: 680 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(8,16,36,0.75)",
            border: "1px solid rgba(99,102,241,0.22)",
            borderRadius: 999,
            padding: "6px 6px 6px 22px",
            boxShadow: "0 8px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.06)",
            backdropFilter: "blur(16px)",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}>
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
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1f5f9", fontSize: 15, padding: "11px 4px", caretColor: "#34d399" }}
            />
            <button
              onClick={handleVerify}
              disabled={!isActive}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                background: isActive ? "linear-gradient(135deg, #059669, #10b981)" : "rgba(255,255,255,0.05)",
                color: isActive ? "#fff" : "#475569",
                border: "none", borderRadius: 999,
                padding: "11px 24px", fontSize: 14, fontWeight: 700,
                cursor: isActive ? "pointer" : "not-allowed",
                transition: "all 0.2s ease",
                minWidth: 108, justifyContent: "center", flexShrink: 0,
                boxShadow: isActive ? "0 0 20px rgba(16,185,129,0.4)" : "none",
              }}
            >
              {appState === "loading" ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <ArrowRight style={{ width: 15, height: 15 }} />}
              {appState === "loading" ? "Running…" : "Verify"}
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: "#334155", marginTop: 10 }}>
            Press <span style={{ color: "#475569", fontFamily: "monospace" }}>↵ Enter</span> to verify · Results include full evidence chain
          </p>
        </div>

        {appState === "loading" && <LoadingCard step={step} logs={logs} />}

        {appState === "error" && (
          <div role="alert" className="animate-fade-slide-up" style={{
            marginTop: 28, width: "100%", maxWidth: 700,
            background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)",
            borderRadius: 18, padding: "18px 22px", display: "flex", gap: 14,
          }}>
            <XCircle style={{ width: 18, height: 18, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#fca5a5", marginBottom: 5 }}>Verification failed</p>
              {streamError && <p style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{streamError}</p>}
              <p style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Make sure the backend (port 8000) and SearXNG (port 8888) are running.</p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {appState === "done" && report && (
          <section
            aria-label="Verification results"
            className="animate-fade-slide-up"
            style={{ marginTop: 44, width: "100%", maxWidth: 900, display: "flex", flexDirection: "column", gap: 14 }}
          >
            {/* ── Direct Answer — short, prominent, with sources ── */}
            {report.answer && (report.trust_score ?? 0) > 0 && (
              <div style={{
                ...card,
                background: "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(5,11,26,0.90))",
                border: "1px solid rgba(52,211,153,0.28)",
                padding: "22px 26px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <CheckCircle style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Direct Answer
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                    {report.has_conflicts && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 999, padding: "3px 10px", color: "#fbbf24" }}>
                        <AlertTriangle style={{ width: 9, height: 9 }} />
                        Conflicting sources
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "#334155", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 999, padding: "3px 10px" }}>
                      {report.source_count ?? 0} sources · {(audit?.verdicts?.length ?? 0)} claims
                    </span>
                  </div>
                </div>

                {/* Answer text — max 4 sentences, no verbose extras */}
                <p style={{ fontSize: 15, fontWeight: 500, color: "#e2e8f0", lineHeight: 1.65, margin: 0 }}>
                  {report.answer}
                </p>

                {/* Top sources right below the answer */}
                {(audit?.verdicts?.flatMap(v => v.top_sources ?? []) ?? []).length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(99,102,241,0.12)" }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
                      Sources
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(audit?.verdicts
                        ?.flatMap(v => v.top_sources ?? [])
                        .filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i)
                        .slice(0, 4) ?? []
                      ).map((src, si) => (
                        <a
                          key={si}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 8,
                            textDecoration: "none",
                            background: "rgba(99,102,241,0.05)",
                            border: "1px solid rgba(99,102,241,0.12)",
                            borderRadius: 10, padding: "8px 12px",
                          }}
                          title={src.url}
                        >
                          <ExternalLink style={{ width: 11, height: 11, flexShrink: 0, marginTop: 2, color: "#818cf8" }} />
                          <span style={{ lineHeight: 1.4 }}>
                            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#a5b4fc" }}>
                              {src.title && src.title !== src.domain ? src.title.slice(0, 80) : src.domain}
                            </span>
                            <span style={{ fontSize: 10, color: "#334155" }}>{src.domain}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* No-evidence message */}
            {(report.trust_score ?? 0) === 0 && report.answer && (
              <div style={{ ...card, padding: "16px 20px" }}>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{report.answer}</p>
              </div>
            )}

            {/* ── Trust Meter ── */}
            <div style={{ ...card, padding: "32px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <TrustMeter score={report.trust_score ?? 0} />
            </div>

            {/* ── Claim Audit ── */}
            {(audit?.verdicts?.length ?? 0) > 0 && (
              <div style={{ ...card, padding: "26px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <Shield style={{ width: 13, height: 13, color: "#818cf8" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#818cf8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
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
                          background: controversial ? "rgba(245,158,11,0.04)" : supported ? "rgba(16,185,129,0.04)" : "rgba(255,255,255,0.02)",
                          border: `1px solid ${controversial ? "rgba(245,158,11,0.18)" : supported ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.06)"}`,
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
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                              {(v.supports?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "#34d399", fontWeight: 600 }}>
                                  ✓ {v.supports.length} supporting
                                </span>
                              )}
                              {(v.refutes?.length ?? 0) > 0 && (
                                <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>
                                  ✗ {v.refutes.length} refuting
                                </span>
                              )}
                              {controversial && (
                                <span style={{ fontSize: 11, color: "#fbbf24" }}>— conflicting evidence</span>
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

            {/* ── Evidence Map (3D canvas, no expand/zoom needed) ── */}
            {(audit?.verdicts?.length ?? 0) > 0 && (
              <div style={{ ...card, padding: "24px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <Globe style={{ width: 13, height: 13, color: "#34d399" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Evidence Map
                  </span>
                  <span style={{ fontSize: 10, color: "#334155", marginLeft: 6 }}>— 3D · auto-rotating</span>
                </div>
                <EvidenceMap verdicts={audit!.verdicts} />
              </div>
            )}
          </section>
        )}

        {/* ── Suggestions ── */}
        {appState === "idle" && (
          <div className="animate-fade-in" style={{ marginTop: 52, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
              Try asking
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 580, margin: "0 auto" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                    color: "#64748b", background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(99,102,241,0.14)", borderRadius: 999,
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
