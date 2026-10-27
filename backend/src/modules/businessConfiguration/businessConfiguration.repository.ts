import { and, asc, eq } from "drizzle-orm";
import type { TransactionDatabase } from "../../db/context.js";
import { businessConfigurations } from "../../db/schema/tenancy.js";
import { businessCustomFields, businessPipelineStages } from "../../db/schema/crm.js";
import type {
  BusinessConfigurationRecord,
  BusinessCustomFieldRecord,
  BusinessPipelineStageRecord,
} from "./businessConfiguration.types.js";

export const DEFAULT_PIPELINE_STAGES = [
  {
    stageKey: "NEW",
    displayName: "New Lead",
    stageOrder: 0,
    stageCategory: "OPEN",
    tabColor: "#2563eb",
    isDefault: true,
  },
  {
    stageKey: "ASSIGNED",
    displayName: "Assigned",
    stageOrder: 1,
    stageCategory: "OPEN",
    tabColor: "#3b82f6",
    isDefault: false,
  },
  {
    stageKey: "FOLLOWUP",
    displayName: "Follow Up",
    stageOrder: 2,
    stageCategory: "OPEN",
    tabColor: "#f59e0b",
    isDefault: false,
  },
  {
    stageKey: "WON",
    displayName: "Won",
    stageOrder: 3,
    stageCategory: "WON",
    tabColor: "#10b981",
    isDefault: false,
  },
  {
    stageKey: "LOST",
    displayName: "Lost",
    stageOrder: 4,
    stageCategory: "LOST",
    tabColor: "#ef4444",
    isDefault: false,
  },
  {
    stageKey: "DISQUALIFIED",
    displayName: "Disqualified",
    stageOrder: 5,
    stageCategory: "DISQUALIFIED",
    tabColor: "#6b7280",
    isDefault: false,
  },
] as const;

export class PostgresBusinessConfigurationRepository {
  async findConfiguration(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
  ): Promise<BusinessConfigurationRecord | null> {
    const [row] = await database.db
      .select()
      .from(businessConfigurations)
      .where(
        and(
          eq(businessConfigurations.tenantId, tenantId),
          eq(businessConfigurations.businessId, businessId),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      businessId: row.businessId,
      vertical: row.vertical,
      businessModel: row.businessModel,
      templateVersion: row.templateVersion,
      currency: row.currency,
      terminologyOverrides: (row.terminologyOverrides as Record<string, string>) ?? {},
      isConfigured: row.isConfigured,
      settings: (row.settings as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsertConfiguration(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    data: Partial<Omit<typeof businessConfigurations.$inferInsert, "id" | "tenantId" | "businessId">>,
  ): Promise<BusinessConfigurationRecord> {
    const [row] = await database.db
      .insert(businessConfigurations)
      .values({
        tenantId,
        businessId,
        vertical: data.vertical ?? "default",
        businessModel: data.businessModel ?? "b2b",
        templateVersion: data.templateVersion ?? "1.0.0",
        currency: data.currency ?? "INR",
        terminologyOverrides: data.terminologyOverrides ?? {},
        isConfigured: data.isConfigured ?? false,
        settings: data.settings ?? {},
      })
      .onConflictDoUpdate({
        target: [businessConfigurations.tenantId, businessConfigurations.businessId],
        set: {
          ...(data.vertical ? { vertical: data.vertical } : {}),
          ...(data.businessModel ? { businessModel: data.businessModel } : {}),
          ...(data.templateVersion ? { templateVersion: data.templateVersion } : {}),
          ...(data.currency ? { currency: data.currency } : {}),
          ...(data.terminologyOverrides ? { terminologyOverrides: data.terminologyOverrides } : {}),
          ...(typeof data.isConfigured === "boolean" ? { isConfigured: data.isConfigured } : {}),
          ...(data.settings ? { settings: data.settings } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert business configuration");
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      businessId: row.businessId,
      vertical: row.vertical,
      businessModel: row.businessModel,
      templateVersion: row.templateVersion,
      currency: row.currency,
      terminologyOverrides: (row.terminologyOverrides as Record<string, string>) ?? {},
      isConfigured: row.isConfigured,
      settings: (row.settings as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listPipelineStages(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    pipelineType = "lead",
  ): Promise<BusinessPipelineStageRecord[]> {
    const rows = await database.db
      .select()
      .from(businessPipelineStages)
      .where(
        and(
          eq(businessPipelineStages.tenantId, tenantId),
          eq(businessPipelineStages.businessId, businessId),
          eq(businessPipelineStages.pipelineType, pipelineType),
        ),
      )
      .orderBy(asc(businessPipelineStages.stageOrder));

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      businessId: r.businessId,
      pipelineType: r.pipelineType,
      stageKey: r.stageKey,
      displayName: r.displayName,
      stageOrder: r.stageOrder,
      stageCategory: r.stageCategory,
      tabColor: r.tabColor,
      isActive: r.isActive,
      isDefault: r.isDefault,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async upsertPipelineStage(
    database: TransactionDatabase,
    stage: typeof businessPipelineStages.$inferInsert,
  ): Promise<BusinessPipelineStageRecord> {
    const [row] = await database.db
      .insert(businessPipelineStages)
      .values(stage)
      .onConflictDoUpdate({
        target: [
          businessPipelineStages.businessId,
          businessPipelineStages.pipelineType,
          businessPipelineStages.stageKey,
        ],
        set: {
          displayName: stage.displayName,
          stageOrder: stage.stageOrder,
          stageCategory: stage.stageCategory,
          tabColor: stage.tabColor,
          isActive: stage.isActive,
          isDefault: stage.isDefault,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert pipeline stage");
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      businessId: row.businessId,
      pipelineType: row.pipelineType,
      stageKey: row.stageKey,
      displayName: row.displayName,
      stageOrder: row.stageOrder,
      stageCategory: row.stageCategory,
      tabColor: row.tabColor,
      isActive: row.isActive,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listCustomFields(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    entityType?: string,
  ): Promise<BusinessCustomFieldRecord[]> {
    const conditions = [
      eq(businessCustomFields.tenantId, tenantId),
      eq(businessCustomFields.businessId, businessId),
    ];
    if (entityType) {
      conditions.push(eq(businessCustomFields.entityType, entityType));
    }

    const rows = await database.db
      .select()
      .from(businessCustomFields)
      .where(and(...conditions))
      .orderBy(asc(businessCustomFields.displayOrder));

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      businessId: r.businessId,
      entityType: r.entityType,
      fieldKey: r.fieldKey,
      fieldName: r.fieldName,
      dataType: r.dataType,
      fieldGroup: r.fieldGroup,
      options: (r.options as unknown[]) ?? [],
      isRequired: r.isRequired,
      displayOrder: r.displayOrder,
      active: r.active,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async upsertCustomField(
    database: TransactionDatabase,
    field: typeof businessCustomFields.$inferInsert,
  ): Promise<BusinessCustomFieldRecord> {
    const [row] = await database.db
      .insert(businessCustomFields)
      .values(field)
      .onConflictDoUpdate({
        target: [
          businessCustomFields.businessId,
          businessCustomFields.entityType,
          businessCustomFields.fieldKey,
        ],
        set: {
          fieldName: field.fieldName,
          dataType: field.dataType,
          fieldGroup: field.fieldGroup,
          options: field.options,
          isRequired: field.isRequired,
          displayOrder: field.displayOrder,
          active: field.active,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert custom field");
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      businessId: row.businessId,
      entityType: row.entityType,
      fieldKey: row.fieldKey,
      fieldName: row.fieldName,
      dataType: row.dataType,
      fieldGroup: row.fieldGroup,
      options: (row.options as unknown[]) ?? [],
      isRequired: row.isRequired,
      displayOrder: row.displayOrder,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async seedDefaultStages(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    pipelineType = "lead",
  ): Promise<BusinessPipelineStageRecord[]> {
    for (const stage of DEFAULT_PIPELINE_STAGES) {
      await database.db
        .insert(businessPipelineStages)
        .values({
          tenantId,
          businessId,
          pipelineType,
          stageKey: stage.stageKey,
          displayName: stage.displayName,
          stageOrder: stage.stageOrder,
          stageCategory: stage.stageCategory,
          tabColor: stage.tabColor,
          isActive: true,
          isDefault: stage.isDefault,
        })
        .onConflictDoNothing({
          target: [
            businessPipelineStages.businessId,
            businessPipelineStages.pipelineType,
            businessPipelineStages.stageKey,
          ],
        });
    }

    return this.listPipelineStages(database, tenantId, businessId, pipelineType);
  }
}

export const businessConfigurationRepository = new PostgresBusinessConfigurationRepository();
