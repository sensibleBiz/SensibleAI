import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { env } from "../../config/env.js";
import {
  postgresAuthorizationRepository,
  type PostgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import { reciprocalRankFusion } from "../search/rrf.js";
import { embedText } from "../assistant/tools/embeddingService.js";
import {
  buildLeadDocument,
  safeEmbeddingQuery,
  sanitizeRetrievalText,
} from "./documents.js";
import {
  postgresAiRetrievalRepository,
  type PostgresAiRetrievalRepository,
  type RetrievalDocument,
} from "./postgresAiRetrieval.repository.js";

export interface AiRetrievalContext {
  leadId: string;
  text: string;
}

export interface AiRetrievalResult {
  contexts: AiRetrievalContext[];
  methods: Array<"exact" | "fts" | "vector">;
}

export const formatAiRetrievalCitations = (
  contexts: readonly Pick<AiRetrievalContext, "leadId">[],
): string => contexts.length
  ? `Sources: ${contexts.map(({ leadId }) => `[Lead ID: ${leadId}]`).join(", ")}`
  : "";

type EmbeddingFunction = (text: string) => Promise<number[]>;

export class AiRetrievalService {
  constructor(
    private readonly repository: Pick<
      PostgresAiRetrievalRepository,
      "exactLeadIds" | "fullTextLeadIds" | "vectorLeadIds" | "getDocuments"
    > = postgresAiRetrievalRepository,
    private readonly embed: EmbeddingFunction = embedText,
    private readonly authorize: Pick<PostgresAuthorizationRepository, "hasOutletPermission"> =
      postgresAuthorizationRepository,
    private readonly audit: (entry: Record<string, unknown>) => void = (entry) => {
      console.info(JSON.stringify(entry));
    },
  ) {}

  async retrieve(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    question: string,
  ): Promise<AiRetrievalResult> {
    const startedAt = Date.now();
    const auditBase = {
      event: "AI_RETRIEVAL",
      tenantId,
      userId,
      outletId,
      model: env.aiRetrieval.embeddingModelVersion,
      provider: env.aiRetrieval.embeddingProvider,
    };
    const allowed = await this.authorize.hasOutletPermission(
      database, userId, tenantId, outletId, "leads.read",
    );
    if (!allowed) {
      this.audit({ ...auditBase, latencyMs: Date.now() - startedAt, outcome: "denied" });
      throw new AppError(403, "Permission denied for reading leads", "PERMISSION_DENIED");
    }

    try {
      await database.client.query("SET LOCAL statement_timeout = '5s'");
      const exactIds = await this.repository.exactLeadIds(database, tenantId, outletId, question);
      const ftsIds = question.trim().length >= 2
        ? await this.repository.fullTextLeadIds(database, tenantId, outletId, question.slice(0, 1_000))
        : [];
      const semanticQuery = safeEmbeddingQuery(question);
      let vectorIds: string[] = [];
      if (env.aiRetrieval.embeddingProvider !== "disabled" && semanticQuery) {
        const embedding = await this.embed(semanticQuery);
        if (embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value))) {
          throw new AppError(502, "Embedding provider returned an invalid vector", "AI_EMBEDDING_INVALID");
        }
        vectorIds = await this.repository.vectorLeadIds(database, tenantId, outletId, embedding);
      }

      const exactSet = new Set(exactIds);
      const ranked = reciprocalRankFusion(exactSet, [
        ["exact", exactIds],
        ["fts", ftsIds],
        ["vector", vectorIds],
      ]);
      const methods: AiRetrievalResult["methods"] = [];
      if (exactIds.length) methods.push("exact");
      if (ftsIds.length) methods.push("fts");
      if (vectorIds.length) methods.push("vector");

      const leadIds = ranked.slice(0, 5).map(({ id }) => id);
      const documents = await this.repository.getDocuments(database, tenantId, outletId, leadIds);
      const contexts = this.buildContexts(leadIds, documents);

      this.audit({
        ...auditBase,
        matchCounts: { exact: exactIds.length, fts: ftsIds.length, vector: vectorIds.length },
        contextCount: contexts.length,
        latencyMs: Date.now() - startedAt,
        outcome: "success",
      });
      return { contexts, methods };
    } catch (error) {
      this.audit({
        ...auditBase,
        latencyMs: Date.now() - startedAt,
        outcome: "failure",
        errorCode: error instanceof AppError ? error.code : "AI_RETRIEVAL_FAILED",
      });
      throw error;
    }
  }

  private buildContexts(leadIds: string[], documents: RetrievalDocument[]): AiRetrievalContext[] {
    const byLead = new Map<string, string[]>();
    for (const doc of documents) {
      let text = doc.text;
      if (doc.sourceType === "lead" && !text) {
        text = buildLeadDocument({
          businessName: doc.businessName ?? null,
          requirement: doc.requirement ?? null,
          source: doc.source ?? null,
          city: doc.city ?? null,
          state: doc.state ?? null,
          stage: doc.stage ?? null,
        });
      } else {
        text = sanitizeRetrievalText(text).slice(0, 500);
      }
      if (!text) continue;
      const snippets = byLead.get(doc.leadId) ?? [];
      if (snippets.length < 2) snippets.push(text);
      byLead.set(doc.leadId, snippets);
    }

    const result: AiRetrievalContext[] = [];
    let remainingChars = 3_000;
    for (const leadId of leadIds) {
      const snippets = byLead.get(leadId);
      if (!snippets?.length || remainingChars <= 0) continue;
      const text = snippets.join(" | ").slice(0, Math.min(700, remainingChars));
      if (!text) continue;
      result.push({ leadId, text });
      remainingChars -= text.length;
    }
    return result;
  }
}

export const aiRetrievalService = new AiRetrievalService();
