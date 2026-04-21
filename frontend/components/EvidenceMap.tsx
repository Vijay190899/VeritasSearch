"use client";

import { useMemo } from "react";
import type { ClaimVerdict, GraphNode, GraphEdge } from "@/lib/types";

interface EvidenceMapProps {
  verdicts: ClaimVerdict[];
}

const CLAIM_COLORS = ["#10b981", "#6366f1", "#a855f7", "#f59e0b", "#ec4899"];
const CANVAS_W = 1100;
const CANVAS_H = 480;
const NODE_W   = 190;  // claim rect half-width * 2
const NODE_H   = 56;   // claim rect height
const DOM_R    = 32;   // domain circle radius

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
      const radius = 135;
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
        style={{ background: "rgba(255,255,255,0.015)", borderRadius: 16 }}
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
          const endX = tgt.x - ux * DOM_R;
          const endY = tgt.y - uy * DOM_R;

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

          // Word-wrap claim label into two lines of ≤26 chars each
          const words   = node.label.split(" ");
          const lines: string[] = [];
          let cur = "";
          for (const w of words) {
            if ((cur + (cur ? " " : "") + w).length > 26) {
              if (cur) lines.push(cur);
              cur = w;
            } else {
              cur = cur ? cur + " " + w : w;
            }
          }
          if (cur) lines.push(cur);
          const lineCount = Math.min(lines.length, 3);
          const lineH = 12;
          const rectH = Math.max(NODE_H, lineCount * lineH + 24);

          return (
            <g key={node.id} transform={`translate(${pos.x},${pos.y})`}>
              {isClaim ? (
                <>
                  <rect
                    x={-NODE_W / 2}
                    y={-rectH / 2}
                    width={NODE_W}
                    height={rectH}
                    rx={12}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="1.5"
                    filter="url(#glow-claim)"
                  />
                  <text
                    textAnchor="middle"
                    fill="#f1f5f9"
                    fontSize={10}
                    fontFamily="var(--font-sans), system-ui, sans-serif"
                    fontWeight="500"
                  >
                    {lines.slice(0, 3).map((line, li) => (
                      <tspan
                        key={li}
                        x="0"
                        dy={li === 0 ? -(lineCount - 1) * lineH / 2 : lineH}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </>
              ) : (
                <>
                  <circle
                    r={DOM_R}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="1.5"
                    filter={node.stance === "SUPPORTS" ? "url(#glow-green)" : "url(#glow-red)"}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#e2e8f0"
                    fontSize={8.5}
                    fontFamily="var(--font-mono), monospace"
                  >
                    {node.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 20, marginTop: 12, paddingLeft: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(16,185,129,0.25)", border: "1px solid rgba(16,185,129,0.6)", display: "inline-block" }} />
          Supports claim
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.6)", display: "inline-block" }} />
          Refutes claim
        </span>
      </div>
    </div>
  );
}
