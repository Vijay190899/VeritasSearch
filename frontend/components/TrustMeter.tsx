"use client";

import { useMemo } from "react";

interface TrustMeterProps {
  score: number; // 0.0 – 1.0
}

type Band = { label: string; color: string; ring: string; glow: string };

function band(score: number): Band {
  if (score >= 0.75) return { label: "High Trust",    color: "#34d399", ring: "#10b981", glow: "rgba(16,185,129,0.5)"  };
  if (score >= 0.50) return { label: "Moderate",      color: "#fbbf24", ring: "#f59e0b", glow: "rgba(245,158,11,0.5)"  };
  if (score >= 0.25) return { label: "Low Trust",     color: "#fb923c", ring: "#f97316", glow: "rgba(249,115,22,0.45)" };
  return               { label: "Unverifiable", color: "#f87171", ring: "#ef4444", glow: "rgba(239,68,68,0.45)"  };
}

export default function TrustMeter({ score }: TrustMeterProps) {
  const { label, color, ring, glow } = useMemo(() => band(score), [score]);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - Math.min(1, Math.max(0, score)) * circ;

  return (
    <figure
      aria-label={`Trust score: ${label}, ${(score * 100).toFixed(0)} out of 100`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
    >
      <div style={{ filter: `drop-shadow(0 0 14px ${glow})` }}>
        <svg width="140" height="140" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
          {/* track */}
          <circle cx="70" cy="70" r={r} fill="none" stroke="#1e2029" strokeWidth="9" />
          {/* arc */}
          <circle
            cx="70" cy="70" r={r}
            fill="none"
            stroke={ring}
            strokeWidth="9"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
          {/* centre fill */}
          <circle cx="70" cy="70" r="40" fill={ring + "1a"} />
          {/* score */}
          <text
            x="70" y="65"
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize="26" fontWeight="700"
            style={{ transform: "rotate(90deg)", transformOrigin: "70px 70px" }}
          >
            {(score * 100).toFixed(0)}
          </text>
          {/* /100 */}
          <text
            x="70" y="83"
            textAnchor="middle" dominantBaseline="middle"
            fill="#64748b" fontSize="10"
            style={{ transform: "rotate(90deg)", transformOrigin: "70px 70px" }}
          >
            / 100
          </text>
        </svg>
      </div>
      <figcaption style={{ fontSize: 13, fontWeight: 600, color }}>{label}</figcaption>
    </figure>
  );
}
