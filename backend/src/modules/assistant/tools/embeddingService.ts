import type { Pool } from "pg";
import { GoogleGenAI } from "@google/genai";
import { env } from "../../../config/env.js";

const EMBEDDING_DIMENSIONS = 768;

let _client: GoogleGenAI | null = null;

const getClient = (): GoogleGenAI => {
  if (_client) return _client;
  if (env.aiRetrieval.embeddingProvider !== "google") {
    throw new Error(`Embedding provider "${env.aiRetrieval.embeddingProvider}" is disabled`);
  }
  const httpOptions = { timeout: env.aiRetrieval.embeddingTimeoutMs };
  if (env.googleAi.useEnterprise) {
    if (!env.googleAi.project || !env.googleAi.location) {
      throw new Error("Google Cloud project and location are required for Gemini Enterprise embeddings");
    }
    _client = new GoogleGenAI({
      enterprise: true,
      project: env.googleAi.project,
      location: env.googleAi.location,
      httpOptions,
    });
    return _client;
  }
  const apiKey = env.googleAi.apiKey;
  if (!apiKey) throw new Error("Google AI API key is required for embeddings (GOOGLE_API_KEY / GEMINI_API_KEY)");
  _client = new GoogleGenAI({ apiKey, httpOptions });
  return _client;
};

export async function embedText(text: string): Promise<number[]> {
  if (!text.trim()) throw new Error("Cannot embed empty text");
  const res = await getClient().models.embedContent({
    model: env.aiRetrieval.embeddingModel,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  const values = res.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Unexpected embedding dimensions: got ${values?.length ?? 0}, expected ${EMBEDDING_DIMENSIONS}`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned a non-finite vector");
  }
  return values;
}

export function leadEmbeddingText(lead: {
  business_name?: string | null;
  requirement?: string | null;
  source?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  return [lead.business_name, lead.requirement, lead.source, lead.city, lead.state]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" | ");
}

export function scheduleLeadEmbedding(
  pool: Pool,
  leadId: string,
  lead: Parameters<typeof leadEmbeddingText>[0],
): void {
  const text = leadEmbeddingText(lead);
  if (!text) return;
  void (async () => {
    try {
      const vec = await embedText(text);
      await pool.query(
        `UPDATE crm.leads SET embedding = $2::vector WHERE id = $1`,
        [leadId, JSON.stringify(vec)],
      );
    } catch (err) {
      console.warn("[embedding] Failed to embed lead", leadId, err instanceof Error ? err.message : String(err));
    }
  })();
}
