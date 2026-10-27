import { Router } from "express";
import { postgresAttendanceRouter } from "../modules/attendance/postgresAttendance.routes.js";
import { postgresBiometricRouter } from "../modules/attendance/postgresBiometric.routes.js";
import { minopBiometricRouter } from "../modules/attendance/minop/minopBiometric.routes.js";
import { postgresLeaveRouter } from "../modules/leave/postgresLeave.routes.js";
import { postgresCallRouter } from "../modules/calls/postgresCall.routes.js";
import { postgresExpenseRouter } from "../modules/expense/postgresExpense.routes.js";
import { eventGatewayRouter } from "../modules/events/eventGateway.routes.js";
import { healthRouter } from "./health.routes.js";
import { sessionRouter } from "./session.routes.js";
import { inboundEmailWebhookRouter } from "./inboundEmailWebhook.routes.js";
import { whatsappAutomationRouter } from "../modules/whatsapp/whatsappAutomation.routes.js";
import { postgresPayrollRouter } from "../modules/payroll/postgresPayroll.routes.js";
import { postgresUserTrackingRouter } from "../modules/userTracking/postgresUserTracking.routes.js";
import { postgresAiContactRouter } from "../modules/aiContacts/postgresAiContact.routes.js";
import { postgresGeneratedContactRouter } from "../modules/generatedContacts/postgresGeneratedContact.routes.js";
import { postgresAuthRouter } from "../modules/auth/auth.routes.js";
import { postgresCurrentUserRouter } from "../modules/authorization/currentUser.routes.js";
import { postgresCustomerRouter } from "../modules/customers/postgresCustomer.routes.js";
import { postgresLeadRouter } from "../modules/leads/postgresLead.routes.js";
import { postgresActivityRouter } from "../modules/activities/postgresActivity.routes.js";
import { postgresTeamRouter } from "../modules/team/postgresTeam.routes.js";
import { postgresAccessControlRouter } from "../modules/authorization/postgresAccessControl.routes.js";
import { postgresProductRouter } from "../modules/products/postgresProduct.routes.js";
import { postgresWarehouseRouter, postgresInventoryRouter } from "../modules/warehouses/postgresWarehouse.routes.js";
import { postgresOutletRouter } from "../modules/outlets/postgresOutlet.routes.js";
import { postgresWhatsAppRouter } from "../modules/whatsapp/postgresWhatsApp.routes.js";
import { postgresReferenceDataRouter } from "../modules/referenceData/postgresReferenceData.routes.js";
import { postgresTaskRouter } from "../modules/tasks/postgresTask.routes.js";
import { postgresIntegrationRouter } from "../modules/integrations/postgresIntegration.routes.js";
import { postgresPublicLinkRouter } from "../modules/publicLinks/postgresPublicLink.routes.js";
import { postgresQuotationRouter } from "../modules/quotations/postgresQuotation.routes.js";
import { postgresBusinessConfigurationRouter } from "../modules/businessConfiguration/businessConfiguration.routes.js";
import { crmAssistantRouter } from "../modules/assistant/crmAssistant.routes.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../middleware/postgresAuth.js";
import { semanticSearchPostgresLeads } from "../modules/leads/postgresLead.controller.js";
import { env } from "../config/env.js";
import { searchRouter } from "../modules/search/search.routes.js";
import { postgresTimelineRouter } from "../modules/timeline/postgresTimeline.routes.js";
import { aiDossierRouter } from "../modules/aiDossiers/aiDossier.routes.js";
import { aiAgentActionsRouter } from "../modules/aiAgentActions/aiAgentActions.routes.js";
import { postgresCommunicationRouter } from "../modules/communication/postgresCommunication.routes.js";
import { phonePePgTopUpRouter, phonePePgWebhookRouter } from "../modules/billing/phonePePg.routes.js";
import { billingWalletRouter } from "../modules/billing/billing.routes.js";
import { rateCardAdminRouter } from "../modules/billing/rateCard.routes.js";
import { pubsubPushRouter } from "./pubsubPush.routes.js";
import { mobileRouter } from "./mobile.routes.js";

export const apiRouter = Router();

console.log("[routes] ✅ semantic-search route loaded");

// Authentication endpoints must be registered before the root-mounted
// PostgreSQL feature routers. Those routers use the PostgreSQL session header
// to select themselves and apply bearer-token authentication at router scope;
// mounting them first would make the public login endpoint require a token.
apiRouter.use("/auth", postgresAuthRouter);
apiRouter.use("/auth", sessionRouter);
apiRouter.use("/webhooks", inboundEmailWebhookRouter);
apiRouter.use("/webhooks", phonePePgWebhookRouter);
apiRouter.use("/pubsub", pubsubPushRouter);
apiRouter.use("/business-configuration", postgresBusinessConfigurationRouter);
apiRouter.use("/assistant", crmAssistantRouter);
apiRouter.use("/ai-actions", aiAgentActionsRouter);
// ── Routers with explicit prefixes ────────────────────────────────────────
apiRouter.use("/health", healthRouter);
apiRouter.use("/mobile", mobileRouter);
apiRouter.use("/attendance/biometric", postgresBiometricRouter);
apiRouter.use("/attendance", postgresAttendanceRouter);
apiRouter.use("/biometric", minopBiometricRouter);
apiRouter.use("/customers", postgresCustomerRouter);
apiRouter.use("/event", eventGatewayRouter);
apiRouter.post("/leads/semantic-search", requirePostgresAuth, withRequestDatabaseContext(semanticSearchPostgresLeads));
if (env.search.v2Enabled) {
  apiRouter.use("/search", searchRouter);
}
apiRouter.use("/leads", postgresLeadRouter);
apiRouter.use("/leave", postgresLeaveRouter);
apiRouter.use("/quotations", postgresQuotationRouter);
apiRouter.use("/team-tree", postgresTeamRouter);
apiRouter.use("/products", postgresProductRouter);
apiRouter.use("/warehouses", postgresWarehouseRouter);
apiRouter.use("/inventory", postgresInventoryRouter);
apiRouter.use("/outlets", postgresOutletRouter);
apiRouter.use("/whatsapp", postgresWhatsAppRouter);
apiRouter.use("/whatsapp-automation", whatsappAutomationRouter);
apiRouter.use("/reference-data", postgresReferenceDataRouter);
apiRouter.use("/tasks", postgresTaskRouter);
apiRouter.use("/integrations", postgresIntegrationRouter);
apiRouter.use("/access-control", postgresAccessControlRouter);
apiRouter.use("/user-tracking", postgresUserTrackingRouter);
apiRouter.use("/ai-contacts", postgresAiContactRouter);
apiRouter.use("/generated-contacts", postgresGeneratedContactRouter);
apiRouter.use("/communication", postgresCommunicationRouter);
apiRouter.use("/billing", phonePePgTopUpRouter);
apiRouter.use("/billing", billingWalletRouter);
apiRouter.use("/billing", rateCardAdminRouter);
// Payroll router: all routes defined under /payroll/... prefix internally
apiRouter.use("/payroll", postgresPayrollRouter);

// ── Self-prefixed routers (mounted at "/") ────────────────────────────────
// These routers define their own path prefixes internally and share the
// /leads/:leadId/* sub-route namespace:
//   postgresActivityRouter  → /activities, /leads/:leadId/activities
//   postgresCallRouter      → /calls, /leads/:leadId/calls
//   postgresExpenseRouter   → /expenses, /expense-budgets
//   postgresCurrentUserRouter → /me
//   postgresPublicLinkRouter  → /public-links, /quick-contacts
apiRouter.use("/", postgresCurrentUserRouter);
apiRouter.use("/", postgresPublicLinkRouter);
apiRouter.use("/", postgresExpenseRouter);
apiRouter.use("/", postgresActivityRouter);
apiRouter.use("/", postgresCallRouter);
apiRouter.use("/", postgresTimelineRouter);
apiRouter.use("/", aiDossierRouter);
