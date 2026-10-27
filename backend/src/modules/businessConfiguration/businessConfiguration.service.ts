import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { postgresOutletRepository } from "../outlets/postgresOutlet.repository.js";
import { businessConfigurationRepository, DEFAULT_PIPELINE_STAGES } from "./businessConfiguration.repository.js";
import type { z } from "zod";
import { saveBusinessConfigurationSchema } from "./businessConfiguration.validator.js";

export const businessConfigurationService = {
  async get(database: TransactionDatabase, tenantId: string, outletId: string) {
    const outlet = await postgresOutletRepository.find(database, tenantId, outletId);
    if (!outlet) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    const businessId = outlet.businessId;

    if (!businessId) {
      return {
        businessId: outletId,
        businessModel: "b2b",
        vertical: "default",
        templateVersion: "1.0.0",
        currency: "INR",
        terminologyOverrides: {},
        isConfigured: false,
        settings: {},
        pipelineStages: [],
        customFields: [],
      };
    }

    const configuration = await businessConfigurationRepository.findConfiguration(
      database,
      tenantId,
      businessId,
    );

    let pipelineStages = await businessConfigurationRepository.listPipelineStages(
      database,
      tenantId,
      businessId,
      "lead",
    );

    if (pipelineStages.length === 0) {
      pipelineStages = await businessConfigurationRepository.seedDefaultStages(
        database,
        tenantId,
        businessId,
        "lead",
      );
    }

    const customFields = await businessConfigurationRepository.listCustomFields(
      database,
      tenantId,
      businessId,
    );

    return {
      ...(configuration ?? {
        businessId,
        businessModel: "b2b",
        vertical: "default",
        templateVersion: "1.0.0",
        currency: "INR",
        terminologyOverrides: {},
        isConfigured: false,
        settings: {},
      }),
      pipelineStages: pipelineStages.filter((stage) => stage.isActive),
      customFields: customFields.filter(
        (field) => field.active && field.entityType.toLowerCase() === "lead",
      ),
    };
  },

  async save(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    input: z.infer<typeof saveBusinessConfigurationSchema>,
  ) {
    const access = await postgresAuthorizationRepository.getCurrentAccess(database, userId, tenantId);
    if (!access.tenant.isTenantAdmin) {
      throw new AppError(403, "Tenant administrator access is required", "BUSINESS_CONFIGURATION_FORBIDDEN");
    }

    const outlet = await postgresOutletRepository.find(database, tenantId, outletId);
    if (!outlet) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    const businessId = outlet.businessId;

    if (!businessId) {
      throw new AppError(404, "No business found for this tenant", "BUSINESS_NOT_FOUND");
    }

    await businessConfigurationRepository.seedDefaultStages(database, tenantId, businessId, "lead");
    const existingConfiguration = await businessConfigurationRepository.findConfiguration(database, tenantId, businessId);
    if (!existingConfiguration?.isConfigured && input.vertical === "exports" && !input.pipelineStages) {
      const exportLabels: Record<string, string> = {
        NEW: "New Trade Inquiry", ASSIGNED: "KYC / Assigned", FOLLOWUP: "RFQ / Technical Review",
        WON: "Order Confirmed / LC Received", LOST: "Inquiry Cancelled", DISQUALIFIED: "Regulatory Disqualified",
      };
      for (const stage of DEFAULT_PIPELINE_STAGES) {
        await businessConfigurationRepository.upsertPipelineStage(database, {
          ...stage, tenantId, businessId, pipelineType: "lead", isActive: true,
          displayName: exportLabels[stage.stageKey]!, stageOrder: stage.stageOrder >= 3 ? stage.stageOrder + 2 : stage.stageOrder,
        });
      }
      for (const [index, stageKey] of ["RFP", "PROPOSAL"].entries()) {
        await businessConfigurationRepository.upsertPipelineStage(database, {
          tenantId, businessId, pipelineType: "lead", stageKey,
          displayName: index === 0 ? "Proforma / Quote Sent" : "Sample & Compliance",
          stageOrder: index + 3, stageCategory: "OPEN", tabColor: "#8b5cf6", isActive: true, isDefault: false,
        });
      }
    }
    for (const stage of input.pipelineStages ?? []) {
      if (!stage.isActive && ["NEW", "ASSIGNED", "FOLLOWUP", "WON", "LOST", "DISQUALIFIED"].includes(stage.stageKey)) {
        throw new AppError(400, "Core workflow stages must stay active", "INVALID_PIPELINE_STAGE");
      }
      await businessConfigurationRepository.upsertPipelineStage(database, { ...stage, tenantId, businessId, pipelineType: "lead" });
    }
    const exportFields = [
      { fieldKey: "destinationCountry", fieldName: "Destination Country", dataType: "text" },
      { fieldKey: "hsCode", fieldName: "HS Code", dataType: "text" },
      { fieldKey: "portOfLoading", fieldName: "Port of Loading", dataType: "text" },
      { fieldKey: "portOfDischarge", fieldName: "Port of Discharge", dataType: "text" },
      { fieldKey: "incoterm", fieldName: "Incoterm", dataType: "select", options: ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] },
      { fieldKey: "currency", fieldName: "Currency", dataType: "select", options: ["USD", "EUR", "INR"] },
    ];
    const operatingCountry = typeof input.settings?.operatingCountry === "string"
      ? input.settings.operatingCountry.trim().toUpperCase()
      : "IN";

    const countryTaxFields: Record<string, Array<{ fieldKey: string; fieldName: string; dataType: string; fieldGroup: string; options?: string[] }>> = {
      IN: [
        { fieldKey: "gstin", fieldName: "GSTIN", dataType: "text", fieldGroup: "Tax & Compliance" },
        { fieldKey: "pan", fieldName: "PAN", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      AE: [
        { fieldKey: "trn", fieldName: "TRN (Tax Registration Number)", dataType: "text", fieldGroup: "Tax & Compliance" },
        { fieldKey: "tradeLicenseNo", fieldName: "Trade License No", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      SA: [
        { fieldKey: "crNumber", fieldName: "Commercial Registration (CR)", dataType: "text", fieldGroup: "Tax & Compliance" },
        { fieldKey: "vatNumber", fieldName: "ZATCA VAT ID", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      US: [
        { fieldKey: "ein", fieldName: "EIN / Federal Tax ID", dataType: "text", fieldGroup: "Tax & Compliance" },
        { fieldKey: "resellerExemptNo", fieldName: "Reseller / Tax Exemption Cert", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      GB: [
        { fieldKey: "vatNumber", fieldName: "UK VAT Number", dataType: "text", fieldGroup: "Tax & Compliance" },
        { fieldKey: "companyNumber", fieldName: "Companies House CRN", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      SG: [
        { fieldKey: "uen", fieldName: "UEN (Unique Entity Number)", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      AU: [
        { fieldKey: "abn", fieldName: "ABN (Australian Business Number)", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
      DE: [
        { fieldKey: "ustIdNr", fieldName: "USt-IdNr (VAT ID)", dataType: "text", fieldGroup: "Tax & Compliance" },
      ],
    };

    const regionalTaxFields = countryTaxFields[operatingCountry] ?? [];
    const fields = input.customFields ?? [
      ...(input.vertical === "exports" ? exportFields : []),
      ...regionalTaxFields,
    ];
    for (const [index, field] of fields.entries()) {
      const fieldObj = field as Record<string, unknown>;
      const fieldGroup = typeof fieldObj.fieldGroup === "string" ? fieldObj.fieldGroup : "General";
      const options = Array.isArray(fieldObj.options) ? fieldObj.options : [];
      await businessConfigurationRepository.upsertCustomField(database, {
        entityType: "lead",
        fieldGroup,
        options,
        isRequired: false,
        displayOrder: index,
        active: true,
        ...field,
        tenantId,
        businessId,
      });
    }
    const { pipelineStages: _stages, customFields: _fields, ...configuration } = input;
    await businessConfigurationRepository.upsertConfiguration(
      database,
      tenantId,
      businessId,
      { ...configuration, isConfigured: true },
    );
    return this.get(database, tenantId, outletId);
  },
};
