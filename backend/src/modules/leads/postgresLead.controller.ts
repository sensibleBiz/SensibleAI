import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type { LeadAnalyticsQuery, LeadBulkCreateInput, LeadCityStateReportQuery, LeadFunnelReportQuery, LeadSourceReportQuery } from "../../types/lead.types.js";
import type {
  EmployeeSalesTargetDeleteQuery,
  EmployeeSalesTargetQuery,
  EmployeeSalesTargetSyncInput,
  PostgresLeadAssignInput,
  PostgresLeadCreateInput,
  PostgresLeadListQuery,
  PostgresLeadRepeatedEnquiryQuery,
  PostgresLeadRingingQuery,
  PostgresLeadStageInput,
  PostgresLeadUpdateInput,
} from "./lead.types.js";
import { postgresLeadService } from "./postgresLead.service.js";

const getContext = (request: Request) => {
  const auth = request.postgresAuth;
  const database = request.database;
  if (!auth || !database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth, database };
};

export const createPostgresLead = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const input = request.body as PostgresLeadCreateInput;
  const lead = await postgresLeadService.create(database, auth.tenantId, auth.userId, input);
  response.status(201).json({ success: true, data: { id: lead.id, lead } });
};

export const createPostgresBulkLeads = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const input = request.validated?.body as LeadBulkCreateInput;
  const result = await postgresLeadService.createBulk(database, auth.tenantId, auth.userId, input);
  response.json({ success: true, data: result });
};

export const getPostgresLead = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { leadId } = request.params as { leadId: string };
  const outletId = String(request.query.outletId ?? "");
  const lead = await postgresLeadService.getById(database, auth.tenantId, auth.userId, outletId, leadId);
  response.json({ success: true, data: lead });
};

export const listPostgresLeads = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as PostgresLeadListQuery;
  const result = await postgresLeadService.list(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const listPostgresEmployeeSalesTargets = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.validated?.query as EmployeeSalesTargetQuery;
  const items = await postgresLeadService.listEmployeeSalesTargets(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: { items } });
};

export const syncPostgresEmployeeSalesTargets = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const input = request.validated?.body as EmployeeSalesTargetSyncInput;
  const items = await postgresLeadService.syncEmployeeSalesTargets(database, auth.tenantId, auth.userId, input);
  response.json({ success: true, data: { items } });
};

export const deletePostgresEmployeeSalesTarget = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { targetId } = request.validated?.params as { targetId: string };
  const { outletId } = request.validated?.query as EmployeeSalesTargetDeleteQuery;
  await postgresLeadService.deleteEmployeeSalesTarget(database, auth.tenantId, auth.userId, outletId, targetId);
  response.json({ success: true, data: { deleted: true } });
};
export const getPostgresEmployeeLeadReport = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as LeadSourceReportQuery;
  const result = await postgresLeadService.getEmployeeReport(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const getPostgresLeadCityStateReport = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as LeadCityStateReportQuery;
  const result = await postgresLeadService.getCityStateReport(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const getPostgresLeadSourceReport = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as LeadSourceReportQuery;
  const result = await postgresLeadService.getSourceReport(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const getPostgresLeadDashboard = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as LeadAnalyticsQuery;
  const result = await postgresLeadService.getDashboard(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};
export const getPostgresLeadFunnelReport = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as LeadFunnelReportQuery;
  const result = await postgresLeadService.getFunnelReport(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const getPostgresLeadStageCounts = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as LeadFunnelReportQuery;
  const result = await postgresLeadService.getStageCounts(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const updatePostgresLead = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { leadId } = request.params as { leadId: string };
  const input = request.body as PostgresLeadUpdateInput;
  const lead = await postgresLeadService.update(database, auth.tenantId, auth.userId, leadId, input);
  response.json({ success: true, data: lead });
};

export const assignPostgresLead = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { leadId } = request.params as { leadId: string };
  const input = request.body as PostgresLeadAssignInput;
  const lead = await postgresLeadService.assign(database, auth.tenantId, auth.userId, leadId, input);
  response.json({ success: true, data: lead });
};

export const changePostgresLeadStage = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { leadId } = request.params as { leadId: string };
  const input = request.body as PostgresLeadStageInput;
  const lead = await postgresLeadService.changeStage(database, auth.tenantId, auth.userId, leadId, input);
  response.json({ success: true, data: lead });
};

export const setPostgresLeadRinging = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { leadId } = request.params as { leadId: string };
  const { outletId, ringing } = request.body as { outletId: string; ringing: boolean };
  const result = await postgresLeadService.setRinging(database, auth.tenantId, auth.userId, outletId, leadId, ringing);
  response.json({ success: true, data: { id: result.id, status: result.status, updatedDate: result.updatedDate } });
};

export const listPostgresRingingLeads = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as PostgresLeadRingingQuery;
  const result = await postgresLeadService.listRinging(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const listPostgresRepeatedEnquiries = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const query = request.query as unknown as PostgresLeadRepeatedEnquiryQuery;
  const result = await postgresLeadService.listRepeatedEnquiries(database, auth.tenantId, auth.userId, query);
  response.json({ success: true, data: result });
};

export const recordPostgresLeadWhatsAppShare = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { leadId } = request.params as { leadId: string };
  const { outletId } = request.body as { outletId: string };
  const result = await postgresLeadService.createShareToken(database, auth.tenantId, auth.userId, outletId, leadId);
  response.json({ success: true, data: result });
};

export const getPostgresSharedLead = async (request: Request, response: Response) => {
  const { database } = getContext(request);
  const { shareToken } = request.params as { shareToken: string };
  const lead = await postgresLeadService.getSharedLead(database, shareToken);
  response.json({ success: true, data: lead });
};

export const semanticSearchPostgresLeads = async (request: Request, response: Response) => {
  const { auth, database } = getContext(request);
  const { outletId, query, limit } = request.body as { outletId: string; query: string; limit?: number };
  console.log("[semantic-search] query:", query, "outletId:", outletId, "tenantId:", auth.tenantId);
  const results = await postgresLeadService.semanticSearch(database, auth.tenantId, auth.userId, outletId, query, limit);
  console.log("[semantic-search] returned", results.length, "results");
  response.json({ success: true, data: results });
};

