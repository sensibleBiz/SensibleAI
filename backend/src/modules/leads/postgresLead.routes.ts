import { Router } from "express";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  assignPostgresLead,
  changePostgresLeadStage,
  createPostgresBulkLeads,
  createPostgresLead,
  deletePostgresEmployeeSalesTarget,
  getPostgresEmployeeLeadReport,
  getPostgresLeadDashboard,
  getPostgresLead,
  getPostgresLeadCityStateReport,
  getPostgresLeadFunnelReport,
  getPostgresLeadStageCounts,
  getPostgresLeadSourceReport,
  getPostgresSharedLead,
  listPostgresEmployeeSalesTargets,
  listPostgresLeads,
  listPostgresRepeatedEnquiries,
  listPostgresRingingLeads,
  recordPostgresLeadWhatsAppShare,
  setPostgresLeadRinging,
  syncPostgresEmployeeSalesTargets,
  updatePostgresLead,
} from "./postgresLead.controller.js";
import {
  employeeSalesTargetDeleteQuerySchema,
  employeeSalesTargetIdParamsSchema,
  employeeSalesTargetListQuerySchema,
  employeeSalesTargetSyncBodySchema,
  postgresLeadAssignSchema,
  postgresLeadBulkCreateSchema,
  postgresLeadCreateSchema,
  postgresLeadIdParamsSchema,
  postgresLeadListQuerySchema,
  postgresLeadRepeatedEnquiryQuerySchema,
  postgresLeadRingingBodySchema,
  postgresLeadRingingListQuerySchema,
  postgresLeadShareTokenParamsSchema,
  postgresLeadStageSchema,
  postgresLeadUpdateSchema,
} from "./postgresLead.validator.js";
import { leadCityStateReportQuerySchema, leadFunnelReportQuerySchema, leadSourceReportQuerySchema } from "../../validators/lead.validator.js";

export const postgresLeadRouter = Router();

postgresLeadRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});

postgresLeadRouter.use(requirePostgresAuth);

postgresLeadRouter.post("/", validateRequest({ body: postgresLeadCreateSchema }), withRequestDatabaseContext(createPostgresLead));
postgresLeadRouter.post("/bulk", validateRequest({ body: postgresLeadBulkCreateSchema }), withRequestDatabaseContext(createPostgresBulkLeads));
postgresLeadRouter.get("/", validateRequest({ query: postgresLeadListQuerySchema }), withRequestDatabaseContext(listPostgresLeads));
postgresLeadRouter.get("/ringing", validateRequest({ query: postgresLeadRingingListQuerySchema }), withRequestDatabaseContext(listPostgresRingingLeads));
postgresLeadRouter.get("/repeated-enquiries", validateRequest({ query: postgresLeadRepeatedEnquiryQuerySchema }), withRequestDatabaseContext(listPostgresRepeatedEnquiries));
postgresLeadRouter.get("/employee-targets", validateRequest({ query: employeeSalesTargetListQuerySchema }), withRequestDatabaseContext(listPostgresEmployeeSalesTargets));
postgresLeadRouter.post("/employee-targets/sync", validateRequest({ body: employeeSalesTargetSyncBodySchema }), withRequestDatabaseContext(syncPostgresEmployeeSalesTargets));
postgresLeadRouter.delete("/employee-targets/:targetId", validateRequest({ params: employeeSalesTargetIdParamsSchema, query: employeeSalesTargetDeleteQuerySchema }), withRequestDatabaseContext(deletePostgresEmployeeSalesTarget));
postgresLeadRouter.get("/reports/employees", validateRequest({ query: leadSourceReportQuerySchema }), withRequestDatabaseContext(getPostgresEmployeeLeadReport));
postgresLeadRouter.get("/reports/source", validateRequest({ query: leadSourceReportQuerySchema }), withRequestDatabaseContext(getPostgresLeadSourceReport));
postgresLeadRouter.get("/reports/city-state", validateRequest({ query: leadCityStateReportQuerySchema }), withRequestDatabaseContext(getPostgresLeadCityStateReport));
postgresLeadRouter.get("/reports/funnel", validateRequest({ query: leadFunnelReportQuerySchema }), withRequestDatabaseContext(getPostgresLeadFunnelReport));
postgresLeadRouter.get("/reports/stage-counts", validateRequest({ query: leadFunnelReportQuerySchema }), withRequestDatabaseContext(getPostgresLeadStageCounts));
postgresLeadRouter.get("/dashboard", validateRequest({ query: leadSourceReportQuerySchema }), withRequestDatabaseContext(getPostgresLeadDashboard));
postgresLeadRouter.get("/share/:shareToken", validateRequest({ params: postgresLeadShareTokenParamsSchema }), withRequestDatabaseContext(getPostgresSharedLead));
postgresLeadRouter.get("/:leadId", validateRequest({ params: postgresLeadIdParamsSchema }), withRequestDatabaseContext(getPostgresLead));
postgresLeadRouter.patch("/:leadId", validateRequest({ params: postgresLeadIdParamsSchema, body: postgresLeadUpdateSchema }), withRequestDatabaseContext(updatePostgresLead));
postgresLeadRouter.post("/:leadId/assign", validateRequest({ params: postgresLeadIdParamsSchema, body: postgresLeadAssignSchema }), withRequestDatabaseContext(assignPostgresLead));
postgresLeadRouter.post("/:leadId/stage", validateRequest({ params: postgresLeadIdParamsSchema, body: postgresLeadStageSchema }), withRequestDatabaseContext(changePostgresLeadStage));
postgresLeadRouter.post("/:leadId/whatsapp-share", validateRequest({ params: postgresLeadIdParamsSchema }), withRequestDatabaseContext(recordPostgresLeadWhatsAppShare));
postgresLeadRouter.post("/:leadId/ringing", validateRequest({ params: postgresLeadIdParamsSchema, body: postgresLeadRingingBodySchema }), withRequestDatabaseContext(setPostgresLeadRinging));


