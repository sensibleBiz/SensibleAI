import { env } from "../../config/env.js";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  postgresAuthorizationRepository,
  type PostgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import type { AiCustomerDossier, DossierSubjectType } from "./aiDossier.types.js";
import {
  postgresAiDossierRepository,
  type PostgresAiDossierRepository,
} from "./postgresAiDossier.repository.js";

export class AiDossierService {
  constructor(
    private readonly repository: Pick<
      PostgresAiDossierRepository,
      "hasOutletFeature" | "subjectExists" | "get" | "request" | "recordFeedback"
    > = postgresAiDossierRepository,
    private readonly authorization: Pick<PostgresAuthorizationRepository, "hasOutletPermission"> =
      postgresAuthorizationRepository,
    private readonly enabled: () => boolean = () => env.aiDossiers.enabled,
  ) {}

  async get(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
  ): Promise<AiCustomerDossier> {
    await this.assertAvailable(database, tenantId, userId, outletId, subjectType);
    const dossier = await this.repository.get(database, tenantId, outletId, subjectType, subjectId);
    if (!dossier) throw new AppError(404, "AI dossier was not requested", "AI_DOSSIER_NOT_FOUND");
    return dossier;
  }

  async request(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
  ): Promise<AiCustomerDossier> {
    await this.assertAvailable(database, tenantId, userId, outletId, subjectType);
    if (!await this.repository.subjectExists(database, tenantId, outletId, subjectType, subjectId)) {
      throw new AppError(
        404,
        subjectType === "lead" ? "Lead was not found" : "Customer was not found",
        subjectType === "lead" ? "LEAD_NOT_FOUND" : "CUSTOMER_NOT_FOUND",
      );
    }
    await this.repository.request(database, tenantId, outletId, subjectType, subjectId);
    const dossier = await this.repository.get(database, tenantId, outletId, subjectType, subjectId);
    if (!dossier) throw new AppError(500, "AI dossier request was not persisted", "AI_DOSSIER_REQUEST_FAILED");
    return dossier;
  }

  async recordFeedback(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
    useful: boolean,
    note?: string,
  ): Promise<void> {
    await this.assertAvailable(database, tenantId, userId, outletId, subjectType);
    if (!await this.repository.subjectExists(database, tenantId, outletId, subjectType, subjectId)) {
      throw new AppError(404, "Dossier subject was not found", "AI_DOSSIER_NOT_FOUND");
    }
    await this.repository.recordFeedback(
      database, tenantId, outletId, subjectType, subjectId, useful, note,
    );
  }

  private async assertAvailable(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    subjectType: DossierSubjectType,
  ) {
    if (!this.enabled()) {
      throw new AppError(404, "AI dossiers are not available", "AI_DOSSIER_NOT_AVAILABLE");
    }
    const permission = subjectType === "lead" ? "leads.read" : "customers.read";
    const allowed = await this.authorization.hasOutletPermission(
      database, userId, tenantId, outletId, permission,
    );
    if (!allowed) {
      throw new AppError(403, "Permission denied for dossier source records", "PERMISSION_DENIED");
    }
    if (!await this.repository.hasOutletFeature(database, tenantId, outletId)) {
      throw new AppError(404, "AI dossiers are not enabled for this outlet", "AI_DOSSIER_NOT_AVAILABLE");
    }
  }
}

export const aiDossierService = new AiDossierService();
