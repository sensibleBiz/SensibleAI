export type AiContactJobStatus = "pending" | "processing" | "completed" | "failed";

export interface AiContactJob {
  id: string;
  outletId: string;
  keywordList: string[];
  category: string;
  city: string;
  contactLimit: number;
  status: AiContactJobStatus;
  contactsCount: number;
  receivedCount: number;
  sentCount: number;
  lastRunAt: number | null;
  errorDetails: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAiContactJobInput {
  outletId: string;
  keywords: string[];
  category?: string;
  city?: string;
  contactLimit?: number;
}

export interface UpdateAiContactJobInput {
  keywords?: string[];
  category?: string;
  city?: string;
  contactLimit?: number;
  status?: AiContactJobStatus;
}
