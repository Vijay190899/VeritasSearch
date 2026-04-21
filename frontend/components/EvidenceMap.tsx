"use client";

import { useEffect, useRef } from "react";
import type { ClaimVerdict } from "@/lib/types";

const CLAIM_COLORS: [number, number, number][] = [
  [16, 185, 129],   // emerald
  [99, 102, 241],   // indigo
  [168, 85, 247],   // violet
  [245, 158, 11],   // amber
  [236, 72, 153],   // pink
  [56, 189, 248],   // sky
];

interface N3 { x: number; y: number; z: number; label: string; type: "claim" | "domain"; stance?: "SUPPORTS" | "REFUTES"; ci: number }
interface E3 { a: N3; b: N3; stance: "SUPPORTS" | "REFUTES" }

export default function EvidenceMap({ verdicts }: { verdicts: ClaimVerdict[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = canvas.parentElement?.offsetWidth ?? 900;
    const H = 540;
    canvas.width = W;
    canvas.height = H;

    const nodes: N3[] = [];
    const edges: E3[] = [];

    const n = verdicts.length;
    const claimR = Math.min(W * 0.22, 180);

    const claimNodes: N3[] = verdicts.map((v, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * claimR, y: 0, z: Math.sin(a) * claimR, label: v.claim_text, type: "claim", ci: i };
    });
    nodes.push(...claimNodes);

    verdicts.forEach((v, ci) => {
      const cn = claimNodes[ci];
      const all = [
        ...v.supports.map(d => ({ d, s: "SUPPORTS" as const })),
        ...v.refutes.map(d => ({ d, s: "REFUTES" as const })),
      ];
      all.forEach(({ d, s }, di) => {
        const da = (di / Math.max(all.length, 1)) * Math.PI * 2;
        const dr = 130;
        const yOff = (di % 2 === 0 ? 1 : -1) * 55;
        const dn: N3 = {
          x: cn.x + Math.cos(da) * dr,
          y: yOff,
          z: cn.z + Math.sin(da) * dr,
          label: d,
          type: "domain",
          stance: s,
          ci,
        };
        nodes.push(dn);
        edges.push({ a: dn, b: cn, stance: s });
      });
    });

    const FOV = 700;
    let rotY = 0;
    let raf = 0;

    function proj(n: N3) {
      const rx = n.x * Math.cos(rotY) - n.z * Math.sin(rotY);
      const rz = n.x * Math.sin(rotY) + n.z * Math.cos(rotY);
      const sc = FOV / (FOV + rz + 500);
      return { sx: W / 2 + rx * sc, sy: H / 2 - n.y * sc * 0.9, sc, depth: rz };
    }

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function wrapText(text: string, maxW: number, fontSize: number): string[] {
      const words = text.split(" ");
      const lines: string[] = [];
      let cur = "";
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines.slice(0, 3);
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      rotY += 0.003;

      // Project everything
      const pNodes = nodes.map(n => ({ n, ...proj(n) }));
      const pEdges = edges.map(e => {
        const pa = proj(e.a), pb = proj(e.b);
        return { e, pa, pb, depth: (pa.depth + pb.depth) / 2 };
      });

      // Depth-sort: back to front
      const all: ({ k: "e"; pe: typeof pEdges[0] } | { k: "n"; pn: typeof pNodes[0] })[] =
        [...pEdges.map(pe => ({ k: "e" as const, pe })),
         ...pNodes.map(pn => ({ k: "n" as const, pn }))];
      all.sort((a, b) => (a.k === "e" ? a.pe.depth : a.pn.depth) - (b.k === "e" ? b.pe.depth : b.pn.depth));

      for (const obj of all) {
        if (obj.k === "e") {
          const { pa, pb, e } = obj.pe;
          const col = e.stance === "SUPPORTS" ? "52,211,153" : "239,68,68";
          const alpha = Math.max(0.08, Math.min(0.45, (1 - obj.pe.depth / 800)));
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(pa.sx, pa.sy);
          ctx.lineTo(pb.sx, pb.sy);
          ctx.strokeStyle = `rgba(${col},${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          // Arrowhead
          const dx = pb.sx - pa.sx, dy = pb.sy - pa.sy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / len, uy2 = dy / len;
          const ax = pb.sx - ux * 14, ay = pb.sy - uy2 * 14;
          ctx.beginPath();
          ctx.moveTo(ax - uy2 * 5, ay + ux * 5);
          ctx.lineTo(pb.sx, pb.sy);
          ctx.lineTo(ax + uy2 * 5, ay - ux * 5);
          ctx.strokeStyle = `rgba(${col},${alpha * 1.8})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        } else {
          const { n, sx, sy, sc, depth } = obj.pn;
          const alpha = Math.max(0.55, Math.min(1.0, 0.7 + (0.4 - depth / 600)));

          if (n.type === "claim") {
            const [r, g, b] = CLAIM_COLORS[n.ci % CLAIM_COLORS.length];
            const boxW = Math.max(140, Math.min(200, 185 * sc));
            const fs = Math.max(9, Math.min(13, 12 * sc));
            const lines = wrapText(n.label, boxW - 20, fs);
            const lineH = fs * 1.4;
            const boxH = Math.max(40, lines.length * lineH + 20);
            ctx.save();
            ctx.globalAlpha = alpha;
            // Glow
            ctx.shadowColor = `rgb(${r},${g},${b})`;
            ctx.shadowBlur = 14 * sc;
            roundRect(sx - boxW / 2, sy - boxH / 2, boxW, boxH, 10 * sc);
            ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
            ctx.lineWidth = 1.5 * sc;
            ctx.stroke();
            ctx.fillStyle = "#f1f5f9";
            ctx.font = `600 ${fs}px system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const totalH = lines.length * lineH;
            lines.forEach((line, li) => {
              ctx.fillText(line, sx, sy - totalH / 2 + lineH * li + lineH / 2);
            });
            ctx.restore();
          } else {
            const col: [number, number, number] = n.stance === "SUPPORTS" ? [52, 211, 153] : [239, 68, 68];
            const [r, g, b] = col;
            const radius = Math.max(22, Math.min(36, 32 * sc));
            const fs = Math.max(7, Math.min(10, 9 * sc));
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowColor = `rgb(${r},${g},${b})`;
            ctx.shadowBlur = 10 * sc;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
            ctx.lineWidth = 1.5 * sc;
            ctx.stroke();
            ctx.fillStyle = "#e2e8f0";
            ctx.font = `${fs}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const lbl = n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label;
            ctx.fillText(lbl, sx, sy);
            ctx.restore();
          }
        }
      }

      // Legend
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "#52d399";
      ctx.fillRect(16, H - 28, 10, 10);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Supports", 30, H - 19);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(70, H - 23, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Refutes", 80, H - 19);
      ctx.restore();

      raf = requestAnimationFrame(tick);
    }

    tick();

    const ro = new ResizeObserver(() => {
      W = canvas.parentElement?.offsetWidth ?? W;
      canvas.width = W;
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [verdicts]);

  if (!verdicts.length)
    return <p style={{ color: "#64748b", textAlign: "center", padding: "40px 0", fontSize: 13 }}>No evidence to display.</p>;

  return (
    <canvas
      ref={canvasRef}
      aria-label="3D evidence graph — source domains linked to claims"
      style={{ width: "100%", height: 540, display: "block", borderRadius: 10 }}
    />
  );
}
