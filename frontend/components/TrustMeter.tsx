"use client";

import { useMemo } from "react";

interface TrustMeterProps {
  score: number; // 0.0 – 1.0
}

function scoreLabel(score: number): { label: string; color: string; ringColor: string } {
  if (score >= 0.75) return { label: "High Trust", color: "text-emerald-400", ringColor: "#10b981" };
  if (score >= 0.50) return { label: "Moderate", color: "text-amber-400", ringColor: "#f59e0b" };
  if (score >= 0.25) return { label: "Low Trust", color: "text-orange-400", ringColor: "#f97316" };
  return { label: "Unverifiable", color: "text-red-400", ringColor: "#ef4444" };
}

export default function TrustMeter({ score }: TrustMeterProps) {
  const { label, color, ringColor } = useMemo(() => scoreLabel(score), [score]);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - score * circumference;

  return (
    <figure aria-label={`Trust score: ${label}, ${(score * 100).toFixed(0)}%`} className="flex flex-col items-center gap-2">
      <svg width="140" height="140" role="img" aria-hidden="true" className="rotate-[-90deg]">
        {/* Background ring */}
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="10"
        />
        {/* Score arc */}
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
        {/* Score text — counter-rotate so it reads normally */}
        <text
          x="70"
          y="70"
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize="22"
          fontWeight="bold"
          transform="rotate(90, 70, 70)"
        >
          {(score * 100).toFixed(0)}
        </text>
        <text
          x="70"
          y="92"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#6b7280"
          fontSize="10"
          transform="rotate(90, 70, 70)"
        >
          / 100
        </text>
      </svg>
      <figcaption className={`text-sm font-semibold ${color}`}>{label}</figcaption>
    </figure>
  );
}
