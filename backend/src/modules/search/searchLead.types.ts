export interface SearchLeadParams {
  outletId: string;
  query: string;
  limit: number;
  enableFts: boolean;
  enableVector: boolean;
}

export interface SearchLeadResult {
  id: string;
  businessName: string;
  customerName: string;
  mobile: string;
  stage: string;
  city: string | null;
  assignedTo: string | null;
  score: number;
  matchedBy: Array<"exact" | "fts" | "vector">;
}

export interface SearchLeadMeta {
  query: string;
  methodsUsed: Array<"exact" | "fts" | "vector">;
  latencyMs: number;
}
