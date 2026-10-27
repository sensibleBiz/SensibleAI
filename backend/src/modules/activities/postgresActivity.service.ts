import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { PostgresLeadRepository, postgresLeadRepository } from "../leads/postgresLead.repository.js";
import type {
  ActivityRepository,
  PostgresActivityCreateInput,
  PostgresActivityItem,
  PostgresActivityListQuery,
  PostgresActivityRecord,
  PostgresActivityUpdateInput,
} from "./activity.types.js";
import { postgresActivityRepository } from "./postgresActivity.repository.js";

const toItem = (record: PostgresActivityRecord): PostgresActivityItem => {
  const createdMilliseconds = record.createdAt.getTime();
  const scheduledMilliseconds = record.scheduledAt?.getTime() ?? 0;
  return {
    id: record.id,
    assignedTo: record.assignedToUserId ?? "",
    createdDate: { seconds: Math.floor(createdMilliseconds / 1000), nanoseconds: (createdMilliseconds % 1000) * 1_000_000 },
    createdDateInMill: createdMilliseconds,
    description: record.description,
    leadName: record.leadNameSnapshot,
    leadMobile: record.leadMobileSnapshot,
    leadRequirement: record.leadRequirementSnapshot,
    leadRefId: record.leadId,
    mode: record.mode,
    priority: record.priority,
    productDealerPrice: record.productDealerPriceSnapshot,
    productId: record.externalProductId ?? record.productIdSnapshot,
    productMrpPrice: record.productMrpSnapshot,
    productName: record.productNameSnapshot,
    productType: record.productTypeSnapshot ?? "",
    scheduledDate: scheduledMilliseconds,
    scheduledTime: scheduledMilliseconds,
    status: record.status,
    type: record.type,
  };
};

export class PostgresActivityService {
  constructor(
    private readonly repository: ActivityRepository = postgresActivityRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
    private readonly leads: PostgresLeadRepository = postgresLeadRepository,
  ) {}

  private async requirePermission(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  async create(database: TransactionDatabase, tenantId: string, userId: string, leadId: string, input: PostgresActivityCreateInput) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "activities.create");
    const lead = await this.leads.lockLead(database, tenantId, input.outletId, leadId);
    if (!lead) throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    if (lead.outletId !== input.outletId) throw new AppError(400, "Activity outlet must match the lead outlet", "LEAD_OUTLET_MISMATCH");
    if (!await this.authorization.hasOutletAccess(database, input.assignedTo, tenantId, input.outletId)) {
      throw new AppError(400, "Assigned user is inactive or does not belong to this outlet", "INVALID_ASSIGNEE");
    }

    if (input.callLater) {
      await this.requirePermission(database, tenantId, userId, input.outletId, "leads.update");
      if (lead.assignedToUserId !== input.assignedTo) {
        await this.requirePermission(database, tenantId, userId, input.outletId, "leads.assign");
      }
    }

    const id = uuidv7();
    await this.repository.create(database, {
      id,
      tenantId,
      businessId: lead.businessId,
      outletId: lead.outletId,
      leadId: lead.id,
      customerId: lead.customerId,
      assignedToUserId: input.assignedTo,
      createdByUserId: userId,
      updatedByUserId: userId,
      activityType: input.type,
      status: "PENDING",
      mode: input.mode,
      priority: input.priority,
      description: input.description.trim(),
      scheduledAt: new Date(input.scheduledDate),
      completedAt: null,
      leadNameSnapshot: lead.customerName,
      leadMobileSnapshot: lead.mobile,
      leadRequirementSnapshot: lead.requirement,
      productIdSnapshot: input.productId,
      productNameSnapshot: input.productName,
      productTypeSnapshot: input.productType,
      productDealerPriceSnapshot: input.productDealerPrice,
      productMrpSnapshot: input.productMrpPrice,
      externalProductSource: input.productId ? "LEGACY_FIRESTORE" : null,
      externalProductId: input.productId,
    });

    if (input.callLater) {
      if (lead.assignedToUserId !== input.assignedTo) {
        await this.leads.recordAssignment(database, tenantId, lead.id, input.assignedTo, userId);
      }
      if (lead.stage !== "FOLLOWUP") {
        await this.leads.recordStageHistory(database, tenantId, lead.id, lead.stage, "FOLLOWUP", userId);
      }
      const updated = await this.leads.update(database, tenantId, input.outletId, lead.id, {
        assignedToUserId: input.assignedTo,
        stage: "FOLLOWUP",
        comments: input.description.trim(),
        updatedByUserId: userId,
      });
      if (!updated) throw new AppError(409, "Lead transition failed", "LEAD_TRANSITION_FAILED");
    }

    const created = await this.repository.getById(database, tenantId, input.outletId, id);
    if (!created) throw new Error("Created activity was not readable inside its transaction");
    return toItem(created);
  }

  async getById(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, activityId: string) {
    await this.requirePermission(database, tenantId, userId, outletId, "activities.read");
    const activity = await this.repository.getById(database, tenantId, outletId, activityId);
    if (!activity) throw new AppError(404, "Activity not found", "ACTIVITY_NOT_FOUND");
    return toItem(activity);
  }

  async list(database: TransactionDatabase, tenantId: string, userId: string, query: PostgresActivityListQuery) {
    await this.requirePermission(database, tenantId, userId, query.outletId, "activities.read");
    let result: Awaited<ReturnType<ActivityRepository["list"]>>;
    try { result = await this.repository.list(database, tenantId, query); }
    catch (error) {
      if (error instanceof Error && error.message === "INVALID_CURSOR") throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
      throw error;
    }
    return {
      items: result.records.map(toItem),
      nextCursor: result.nextCursor,
      summary: query.cursor ? null : await this.repository.summarize(database, tenantId, query),
    };
  }

  listLead(database: TransactionDatabase, tenantId: string, userId: string, leadId: string, query: PostgresActivityListQuery) {
    return this.list(database, tenantId, userId, { ...query, leadId }).then((result) => ({ items: result.items, nextCursor: result.nextCursor }));
  }

  async update(database: TransactionDatabase, tenantId: string, userId: string, activityId: string, input: PostgresActivityUpdateInput) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "activities.update");
    const current = await this.repository.getById(database, tenantId, input.outletId, activityId);
    if (!current) throw new AppError(404, "Activity not found", "ACTIVITY_NOT_FOUND");
    if (input.assignedTo && !await this.authorization.hasOutletAccess(database, input.assignedTo, tenantId, input.outletId)) {
      throw new AppError(400, "Assigned user is inactive or does not belong to this outlet", "INVALID_ASSIGNEE");
    }
    const values: Record<string, unknown> = { updatedByUserId: userId };
    if (input.assignedTo !== undefined) values.assignedToUserId = input.assignedTo;
    if (input.scheduledDate !== undefined) values.scheduledAt = new Date(input.scheduledDate);
    if (input.status !== undefined) {
      values.status = input.status;
      values.completedAt = input.status === "DONE" ? current.completedAt ?? new Date() : null;
    }
    await this.repository.update(database, tenantId, input.outletId, activityId, values);
    const updated = await this.repository.getById(database, tenantId, input.outletId, activityId);
    if (!updated) throw new AppError(404, "Activity not found", "ACTIVITY_NOT_FOUND");
    return toItem(updated);
  }

  async delete(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, activityId: string) {
    await this.requirePermission(database, tenantId, userId, outletId, "activities.delete");
    const current = await this.repository.getById(database, tenantId, outletId, activityId);
    if (!current) throw new AppError(404, "Activity not found", "ACTIVITY_NOT_FOUND");
    if (!await this.repository.delete(database, tenantId, outletId, activityId)) throw new AppError(404, "Activity not found", "ACTIVITY_NOT_FOUND");
    return { id: activityId };
  }
}

export const postgresActivityService = new PostgresActivityService();

