"use client";

import { useMemo } from "react";
import type { ClaimVerdict, GraphNode, GraphEdge } from "@/lib/types";

interface EvidenceMapProps {
  verdicts: ClaimVerdict[];
}

const CLAIM_COLORS = ["#10b981", "#3b82f6", "#a855f7", "#f59e0b", "#ec4899"];
const CANVAS_W = 800;
const CANVAS_H = 340;

function buildGraph(verdicts: ClaimVerdict[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const domainSeen = new Set<string>();

  for (const v of verdicts) {
    nodes.push({ id: v.claim_id, label: v.claim_text.slice(0, 48) + "…", type: "claim" });

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

function layoutNodes(
  nodes: GraphNode[],
  verdicts: ClaimVerdict[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const claimCount = verdicts.length;

  // Claims in a horizontal row at y=50%
  verdicts.forEach((v, i) => {
    const x = ((i + 1) / (claimCount + 1)) * CANVAS_W;
    positions.set(v.claim_id, { x, y: CANVAS_H / 2 });
  });

  // Domain nodes arranged around their claim
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
      const radius = 110;
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
    return <p className="text-sm text-gray-500 text-center py-8">No evidence to display.</p>;
  }

  return (
    <div
      className="w-full overflow-x-auto rounded-xl"
      role="img"
      aria-label="Evidence graph showing source domains linked to verified claims"
    >
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        height={CANVAS_H}
        className="bg-gray-950/60 rounded-xl"
        aria-hidden="true"
      >
        <defs>
          <marker id="arrow-support" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#10b981" />
          </marker>
          <marker id="arrow-refute" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const src = positions.get(e.source);
          const tgt = positions.get(e.target);
          if (!src || !tgt) return null;
          const isSupport = e.stance === "SUPPORTS";
          return (
            <line
              key={i}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={isSupport ? "#10b981" : "#ef4444"}
              strokeWidth={1.5}
              strokeOpacity={0.5}
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

          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              {isClaim ? (
                <rect
                  x={-60}
                  y={-18}
                  width={120}
                  height={36}
                  rx={8}
                  fill={claimColor! + "22"}
                  stroke={claimColor}
                  strokeWidth={1.5}
                />
              ) : (
                <circle r={20} fill={domainColor + "22"} stroke={domainColor} strokeWidth={1.5} />
              )}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#e5e7eb"
                fontSize={isClaim ? 9 : 8}
                fontFamily="monospace"
              >
                {node.label.slice(0, isClaim ? 24 : 18)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-5 mt-3 px-2 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500" />
          Supports claim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
          Refutes claim
        </span>
      </div>
    </div>
  );
}
