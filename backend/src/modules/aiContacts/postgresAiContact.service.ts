import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import type { CreateAiContactJobInput, UpdateAiContactJobInput } from "./aiContact.types.js";
import { PostgresAiContactRepository, postgresAiContactRepository } from "./postgresAiContact.repository.js";

export class PostgresAiContactService {
  constructor(
    private readonly repository: PostgresAiContactRepository = postgresAiContactRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requirePermission(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  async list(database: TransactionDatabase, tenantId: string, userId: string, outletId: string) {
    await this.requirePermission(database, tenantId, userId, outletId, "ai_contacts.read");
    return this.repository.list(database, tenantId, outletId);
  }

  async create(database: TransactionDatabase, tenantId: string, userId: string, input: CreateAiContactJobInput) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "ai_contacts.create");
    return this.repository.create(database, tenantId, userId, input);
  }

  async update(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, jobId: string, input: UpdateAiContactJobInput) {
    await this.requirePermission(database, tenantId, userId, outletId, "ai_contacts.update");
    const job = await this.repository.update(database, tenantId, outletId, jobId, userId, input);
    if (!job) throw new AppError(404, "AI contact job not found", "AI_CONTACT_JOB_NOT_FOUND");
    return job;
  }

  async delete(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, jobId: string) {
    await this.requirePermission(database, tenantId, userId, outletId, "ai_contacts.delete");
    if (!await this.repository.delete(database, tenantId, outletId, jobId)) {
      throw new AppError(404, "AI contact job not found", "AI_CONTACT_JOB_NOT_FOUND");
    }
    return { id: jobId, deleted: true as const };
  }
}

export const postgresAiContactService = new PostgresAiContactService();
