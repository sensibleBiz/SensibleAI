export interface BusinessConfigurationRecord {
  id: string;
  tenantId: string;
  businessId: string;
  vertical: string;
  businessModel: string;
  templateVersion: string;
  currency: string;
  terminologyOverrides: Record<string, string>;
  isConfigured: boolean;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessPipelineStageRecord {
  id: string;
  tenantId: string;
  businessId: string;
  pipelineType: string;
  stageKey: string;
  displayName: string;
  stageOrder: number;
  stageCategory: string;
  tabColor: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessCustomFieldRecord {
  id: string;
  tenantId: string;
  businessId: string;
  entityType: string;
  fieldKey: string;
  fieldName: string;
  dataType: string;
  fieldGroup: string;
  options: unknown[];
  isRequired: boolean;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
