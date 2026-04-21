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

export default function EvidenceMap({ verdicts }: { verdicts: ClaimVerdict[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const H = 580;

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx!.beginPath();
      ctx!.moveTo(x + r, y);
      ctx!.arcTo(x + w, y, x + w, y + h, r);
      ctx!.arcTo(x + w, y + h, x, y + h, r);
      ctx!.arcTo(x, y + h, x, y, r);
      ctx!.arcTo(x, y, x + w, y, r);
      ctx!.closePath();
    }

    function wrapText(text: string, maxW: number, fs: number): string[] {
      ctx!.font = `600 ${fs}px system-ui, sans-serif`;
      const words = text.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (ctx!.measureText(test).width > maxW && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      return lines.slice(0, 3);
    }

    function draw() {
      const W = canvas!.width;
      ctx!.clearRect(0, 0, W, H);

      const n = verdicts.length;
      if (n === 0) return;

      const centerY = H * 0.43;
      // Adaptive spacing so claims don't crowd
      const slotW = W / n;
      const claimBoxW = Math.min(220, slotW * 0.52);
      const domainRadius = Math.min(175, slotW * 0.50);
      const nodeRadius = Math.min(50, domainRadius * 0.30);

      const claimCenters = verdicts.map((_, i) => ({
        x: (i + 0.5) * slotW,
        y: centerY,
      }));

      // ── Edges (drawn first, behind nodes) ────────────────────────────────────
      verdicts.forEach((v, ci) => {
        const cp = claimCenters[ci];
        const all = [
          ...v.supports.map(d => ({ d, stance: "SUPPORTS" as const })),
          ...v.refutes.map(d => ({ d, stance: "REFUTES" as const })),
        ];
        all.forEach(({ d: _d, stance }, di) => {
          const angle = (di / Math.max(all.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const ex = cp.x + Math.cos(angle) * domainRadius;
          const ey = cp.y + Math.sin(angle) * domainRadius;
          const col = stance === "SUPPORTS" ? "52,211,153" : "239,68,68";

          ctx!.save();
          ctx!.beginPath();
          ctx!.moveTo(ex, ey);
          ctx!.lineTo(cp.x, cp.y);
          ctx!.strokeStyle = `rgba(${col},0.30)`;
          ctx!.lineWidth = 1.8;
          ctx!.stroke();

          // Arrowhead toward claim
          const dx = cp.x - ex, dy2 = cp.y - ey;
          const len = Math.sqrt(dx * dx + dy2 * dy2) || 1;
          const ux2 = dx / len, uy2 = dy2 / len;
          // tip is at edge of claim box approx
          const tipX = cp.x - ux2 * (claimBoxW / 2 + 4);
          const tipY = cp.y - uy2 * 36;
          const ax = tipX - ux2 * 12, ay = tipY - uy2 * 12;
          ctx!.beginPath();
          ctx!.moveTo(ax - uy2 * 5, ay + ux2 * 5);
          ctx!.lineTo(tipX, tipY);
          ctx!.lineTo(ax + uy2 * 5, ay - ux2 * 5);
          ctx!.strokeStyle = `rgba(${col},0.55)`;
          ctx!.lineWidth = 1.4;
          ctx!.stroke();
          ctx!.restore();
        });
      });

      // ── Claim nodes ──────────────────────────────────────────────────────────
      verdicts.forEach((v, ci) => {
        const cp = claimCenters[ci];
        const [r, g, b] = CLAIM_COLORS[ci % CLAIM_COLORS.length];
        const fs = 13;
        const lines = wrapText(v.claim_text, claimBoxW - 26, fs);
        const lineH = fs * 1.55;
        const boxH = Math.max(62, lines.length * lineH + 26);
        const bx = cp.x - claimBoxW / 2;
        const by = cp.y - boxH / 2;

        ctx!.save();
        ctx!.shadowColor = `rgb(${r},${g},${b})`;
        ctx!.shadowBlur = 22;
        roundRect(bx, by, claimBoxW, boxH, 13);
        ctx!.fillStyle = `rgba(${r},${g},${b},0.13)`;
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.strokeStyle = `rgba(${r},${g},${b},0.85)`;
        ctx!.lineWidth = 2;
        ctx!.stroke();

        ctx!.fillStyle = "#f1f5f9";
        ctx!.font = `600 ${fs}px system-ui, sans-serif`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "top";
        const textStartY = by + (boxH - lines.length * lineH) / 2;
        lines.forEach((line, li) => {
          ctx!.fillText(line, cp.x, textStartY + li * lineH);
        });
        ctx!.restore();
      });

      // ── Domain nodes ─────────────────────────────────────────────────────────
      verdicts.forEach((v, ci) => {
        const cp = claimCenters[ci];
        const all = [
          ...v.supports.map(d => ({ d, stance: "SUPPORTS" as const })),
          ...v.refutes.map(d => ({ d, stance: "REFUTES" as const })),
        ];
        all.forEach(({ d, stance }, di) => {
          const angle = (di / Math.max(all.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const ex = cp.x + Math.cos(angle) * domainRadius;
          const ey = cp.y + Math.sin(angle) * domainRadius;
          const [r, g, b]: [number, number, number] = stance === "SUPPORTS" ? [52, 211, 153] : [239, 68, 68];

          ctx!.save();
          ctx!.shadowColor = `rgb(${r},${g},${b})`;
          ctx!.shadowBlur = 14;
          ctx!.beginPath();
          ctx!.arc(ex, ey, nodeRadius, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${r},${g},${b},0.13)`;
          ctx!.fill();
          ctx!.shadowBlur = 0;
          ctx!.strokeStyle = `rgba(${r},${g},${b},0.88)`;
          ctx!.lineWidth = 2;
          ctx!.stroke();

          // Domain name — strip www., keep rest, 2 lines
          const shortD = d.replace(/^www\./, "");
          const parts = shortD.split(".");
          const line1 = parts.slice(0, -1).join(".").slice(0, 13) || shortD.slice(0, 13);
          const line2 = stance === "SUPPORTS" ? "✓" : "✗";

          ctx!.fillStyle = "#e2e8f0";
          ctx!.font = `700 10px system-ui, sans-serif`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText(line1.length > 13 ? line1.slice(0, 12) + "…" : line1, ex, ey - 6);
          ctx!.font = `bold 12px system-ui, sans-serif`;
          ctx!.fillStyle = stance === "SUPPORTS" ? "#34d399" : "#f87171";
          ctx!.fillText(line2, ex, ey + 9);
          ctx!.restore();
        });
      });

      // ── Legend ───────────────────────────────────────────────────────────────
      ctx!.save();
      ctx!.globalAlpha = 0.65;
      ctx!.beginPath();
      ctx!.arc(18, H - 18, 7, 0, Math.PI * 2);
      ctx!.fillStyle = "#34d399";
      ctx!.fill();
      ctx!.font = "12px system-ui, sans-serif";
      ctx!.fillStyle = "#94a3b8";
      ctx!.textAlign = "left";
      ctx!.textBaseline = "middle";
      ctx!.fillText("Supports", 30, H - 18);
      ctx!.beginPath();
      ctx!.arc(106, H - 18, 7, 0, Math.PI * 2);
      ctx!.fillStyle = "#ef4444";
      ctx!.fill();
      ctx!.fillStyle = "#94a3b8";
      ctx!.fillText("Refutes", 118, H - 18);
      ctx!.restore();
    }

    let W = canvas.parentElement?.offsetWidth ?? 900;
    canvas.width = W;
    canvas.height = H;
    draw();

    const ro = new ResizeObserver(() => {
      const newW = canvas.parentElement?.offsetWidth ?? W;
      if (newW !== W) {
        W = newW;
        canvas.width = W;
        draw();
      }
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => ro.disconnect();
  }, [verdicts]);

  if (!verdicts.length)
    return (
      <p style={{ color: "#64748b", textAlign: "center", padding: "40px 0", fontSize: 13 }}>
        No evidence to display.
      </p>
    );

  return (
    <canvas
      ref={canvasRef}
      aria-label="Evidence graph — source domains linked to claims"
      style={{ width: "100%", height: 580, display: "block", borderRadius: 10 }}
    />
  );
}
