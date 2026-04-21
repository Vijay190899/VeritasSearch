export interface EvidenceQuote {
  domain: string;
  quote: string;
  stance: "SUPPORTS" | "REFUTES" | "IRRELEVANT";
  url?: string;
  title?: string;
}

export interface TopSource {
  url: string;
  title: string;
  domain: string;
}

export interface ClaimVerdict {
  claim_id: string;
  claim_text: string;
  supports: string[];
  refutes: string[];
  consensus_score: number;
  is_controversial: boolean;
  provenance_score: number;
  evidence_quotes: EvidenceQuote[];
  top_sources?: TopSource[];
}

export interface AuditResult {
  verdicts: ClaimVerdict[];
  overall_trust: number;
  has_conflicts: boolean;
}

export interface VerificationReport {
  answer: string;
  short_answer?: string;
  trust_score: number;
  has_conflicts: boolean;
  verdicts: ClaimVerdict[];
  source_count: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "claim" | "domain";
  stance?: "SUPPORTS" | "REFUTES";
}

export interface GraphEdge {
  source: string;
  target: string;
  stance: "SUPPORTS" | "REFUTES";
}
