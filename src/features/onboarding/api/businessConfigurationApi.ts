import { apiRequest } from "@/shared/api/apiClient";

export interface BusinessConfigurationInput {
  businessModel: string;
  vertical: string;
  templateVersion: string;
  currency: string;
  terminologyOverrides: Record<string, string>;
  settings: Record<string, unknown>;
  pipelineStages?: Array<Omit<BusinessPipelineStage, "id">>;
  customFields?: Array<Omit<BusinessCustomField, "id">>;
}

export interface BusinessConfigurationStatus extends BusinessConfigurationInput {
  id?: string;
  businessId?: string;
  isConfigured: boolean;
  pipelineStages?: BusinessPipelineStage[];
  customFields?: BusinessCustomField[];
}

export interface BusinessPipelineStage {
  id: string;
  stageKey: string;
  displayName: string;
  stageOrder: number;
  stageCategory: string;
  tabColor: string;
  isActive: boolean;
  isDefault: boolean;
}

export interface BusinessCustomField {
  id: string;
  entityType: string;
  fieldKey: string;
  fieldName: string;
  dataType: string;
  fieldGroup: string;
  options: unknown[];
  isRequired: boolean;
  displayOrder: number;
  active: boolean;
}

export const businessConfigurationApi = {
  get(outletId: string, signal?: AbortSignal) {
    return apiRequest<BusinessConfigurationStatus>(
      `/api/v1/business-configuration/${encodeURIComponent(outletId)}`,
      { signal },
    );
  },
  save(outletId: string, configuration: BusinessConfigurationInput) {
    return apiRequest<BusinessConfigurationStatus>(
      `/api/v1/business-configuration/${encodeURIComponent(outletId)}`,
      { method: "PUT", body: configuration },
    );
  },
};
