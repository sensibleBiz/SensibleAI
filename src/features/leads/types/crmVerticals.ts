export type CrmVerticalType =
  | "default"
  | "exports"
  | "manufacturing"
  | "services"
  | "realestate";

export type ExportIncoterm =
  | "FOB" // Free On Board
  | "CIF" // Cost, Insurance, and Freight
  | "EXW" // Ex Works
  | "CFR" // Cost and Freight
  | "DDP" // Delivered Duty Paid
  | "CIP" // Carriage and Insurance Paid
  | "FCA"; // Free Carrier

export interface ExportLeadAttributes {
  hsCode?: string;
  incoterm?: ExportIncoterm;
  portOfLoading?: string;
  portOfDischarge?: string;
  destinationCountry?: string;
  containerType?: "20ft" | "40ft" | "40ft HQ" | "LCL";
  currency?: string; // e.g. USD, EUR, INR
  targetShipmentDate?: number | string;
  buyerIEC?: string; // Importer Exporter Code / VAT / Registration
  inspectionAgency?: string;
}

export interface CrmTerminologyConfig {
  leadLabel: string;
  leadsLabel: string;
  dealLabel: string;
  customerLabel: string;
  pipelineTitle: string;
  newLeadAction: string;
  stageLabels?: Record<string, string>;
}

export const VERTICAL_TERMINOLOGY: Record<CrmVerticalType, CrmTerminologyConfig> = {
  default: {
    leadLabel: "Lead",
    leadsLabel: "Leads",
    dealLabel: "Deal",
    customerLabel: "Customer",
    pipelineTitle: "Lead Pipeline",
    newLeadAction: "New Enquiry",
  },
  exports: {
    leadLabel: "Trade Inquiry",
    leadsLabel: "Trade Inquiries",
    dealLabel: "Export Deal",
    customerLabel: "Buyer / Importer",
    pipelineTitle: "Export Pipeline",
    newLeadAction: "New Trade Inquiry",
    stageLabels: {
      NEW: "New Trade Inquiry",
      ASSIGNED: "KYC / Assigned",
      FOLLOWUP: "RFQ / Technical Review",
      RFP: "Proforma / Quote Sent",
      PROPOSAL: "Sample & Compliance",
      WON: "Order Confirmed / LC Received",
      LOST: "Inquiry Cancelled",
      DISQUALIFIED: "Regulatory Disqualified",
    },
  },
  manufacturing: {
    leadLabel: "RFQ",
    leadsLabel: "RFQs",
    dealLabel: "Production Contract",
    customerLabel: "Client / OEM",
    pipelineTitle: "Manufacturing Pipeline",
    newLeadAction: "New RFQ",
  },
  services: {
    leadLabel: "Inquiry",
    leadsLabel: "Inquiries",
    dealLabel: "Engagement",
    customerLabel: "Client",
    pipelineTitle: "Client Pipeline",
    newLeadAction: "New Inquiry",
  },
  realestate: {
    leadLabel: "Prospect",
    leadsLabel: "Prospects",
    dealLabel: "Unit Booking",
    customerLabel: "Buyer / Tenant",
    pipelineTitle: "Property Sales Pipeline",
    newLeadAction: "New Prospect",
  },
};

