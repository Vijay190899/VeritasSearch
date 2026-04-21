"use client";

import { useMemo } from "react";
import type { ClaimVerdict, GraphNode, GraphEdge } from "@/lib/types";

interface EvidenceMapProps {
  verdicts: ClaimVerdict[];
}

const CLAIM_COLORS = ["#10b981", "#6366f1", "#a855f7", "#f59e0b", "#ec4899"];
const CANVAS_W = 800;
const CANVAS_H = 360;

function buildGraph(verdicts: ClaimVerdict[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const domainSeen = new Set<string>();

  for (const v of verdicts) {
    nodes.push({ id: v.claim_id, label: v.claim_text.slice(0, 48) + (v.claim_text.length > 48 ? "…" : ""), type: "claim" });

    for (const domain of v.supports) {
      if (!domainSeen.has(domain)) {
        nodes.push({ id: domain, label: domain, type: "domain", stance: "SUPPORTS" });
        domainSeen.add(domain);
      }
      edges.push({ source: domain, target: v.claim_id, stance: "SUPPORTS" });
    }
    for (const domain of v.refutes) {
      if (!domainSeen.has(domain)) {
        nodes.push({ id: domain, label: domain, type: "domain", stance: "REFUTES" });
        domainSeen.add(domain);
      }
      edges.push({ source: domain, target: v.claim_id, stance: "REFUTES" });
    }
  }
  return { nodes, edges };
}

function layoutNodes(nodes: GraphNode[], verdicts: ClaimVerdict[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const claimCount = verdicts.length;

  verdicts.forEach((v, i) => {
    const x = ((i + 1) / (claimCount + 1)) * CANVAS_W;
    positions.set(v.claim_id, { x, y: CANVAS_H / 2 });
  });

  const domainsByClaimId: Record<string, string[]> = {};
  for (const v of verdicts) {
    domainsByClaimId[v.claim_id] = [...v.supports, ...v.refutes];
  }

  for (const v of verdicts) {
    const claimPos = positions.get(v.claim_id)!;
    const domains = domainsByClaimId[v.claim_id];
    domains.forEach((domain, i) => {
      if (positions.has(domain)) return;
      const angle = (Math.PI / (domains.length + 1)) * (i + 1);
      const radius = 115;
      const side = i % 2 === 0 ? 1 : -1;
      positions.set(domain, {
        x: claimPos.x + Math.cos(angle) * radius * side,
        y: claimPos.y + Math.sin(angle) * radius * (i < domains.length / 2 ? -1 : 1),
      });
    });
  }

  return positions;
}

export default function EvidenceMap({ verdicts }: EvidenceMapProps) {
  const { nodes, edges } = useMemo(() => buildGraph(verdicts), [verdicts]);
  const positions = useMemo(() => layoutNodes(nodes, verdicts), [nodes, verdicts]);

  if (verdicts.length === 0) {
    return (
      <p className="text-sm text-gray-600 text-center py-10">
        No evidence to display.
      </p>
    );
  }

  return (
    <div
      className="w-full overflow-x-auto"
      role="img"
      aria-label="Evidence graph: source domains linked to verified claims"
    >
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        height={CANVAS_H}
        className="rounded-xl"
        style={{ background: "rgba(255,255,255,0.02)" }}
        aria-hidden="true"
      >
        <defs>
          {/* Arrow markers */}
          <marker id="arrow-support" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill="#10b981" opacity="0.8" />
          </marker>
          <marker id="arrow-refute" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill="#ef4444" opacity="0.8" />
          </marker>

          {/* Glow filters */}
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-claim" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const src = positions.get(e.source);
          const tgt = positions.get(e.target);
          if (!src || !tgt) return null;
          const isSupport = e.stance === "SUPPORTS";
          const color = isSupport ? "#10b981" : "#ef4444";
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / len;
          const uy = dy / len;
          const endX = tgt.x - ux * 22;
          const endY = tgt.y - uy * 22;

          return (
            <line
              key={i}
              x1={src.x}
              y1={src.y}
              x2={endX}
              y2={endY}
              stroke={color}
              strokeWidth="1.5"
              strokeOpacity="0.35"
              markerEnd={isSupport ? "url(#arrow-support)" : "url(#arrow-refute)"}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const isClaim = node.type === "claim";
          const claimIndex = verdicts.findIndex((v) => v.claim_id === node.id);
          const claimColor = isClaim ? CLAIM_COLORS[claimIndex % CLAIM_COLORS.length] : undefined;
          const domainColor = node.stance === "SUPPORTS" ? "#10b981" : "#ef4444";
          const fill = isClaim ? (claimColor! + "20") : (domainColor + "18");
          const stroke = isClaim ? claimColor! : domainColor;

          return (
            <g key={node.id} transform={`translate(${pos.x},${pos.y})`}>
              {isClaim ? (
                <>
                  <rect
                    x={-65}
                    y={-20}
                    width={130}
                    height={40}
                    rx={10}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="1.5"
                    filter="url(#glow-claim)"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#e5e7eb"
                    fontSize={9}
                    fontFamily="var(--font-mono), monospace"
                  >
                    {node.label.slice(0, 28)}
                  </text>
                </>
              ) : (
                <>
                  <circle
                    r={22}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="1.5"
                    filter={node.stance === "SUPPORTS" ? "url(#glow-green)" : "url(#glow-red)"}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#d1d5db"
                    fontSize={8}
                    fontFamily="var(--font-mono), monospace"
                  >
                    {node.label.slice(0, 14)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex gap-5 mt-3 px-1 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/25 border border-emerald-500/60" aria-hidden="true" />
          Supports claim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500/25 border border-red-500/60" aria-hidden="true" />
          Refutes claim
        </span>
      </div>
    </div>
  );
}
