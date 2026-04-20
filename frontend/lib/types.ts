export interface EvidenceQuote {
  domain: string;
  quote: string;
  stance: "SUPPORTS" | "REFUTES" | "IRRELEVANT";
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
}

export interface AuditResult {
  verdicts: ClaimVerdict[];
  overall_trust: number;
  has_conflicts: boolean;
}

export interface VerificationReport {
  answer: string;
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
