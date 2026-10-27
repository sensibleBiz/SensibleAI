import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { getAiDossier, recordAiDossierFeedback, requestAiDossier } from "./aiDossier.controller.js";
import {
  aiDossierCustomerParamsSchema,
  aiDossierFeedbackSchema,
  aiDossierLeadParamsSchema,
  aiDossierOutletQuerySchema,
  aiDossierRequestSchema,
} from "./aiDossier.validator.js";

export const aiDossierRouter = Router();

aiDossierRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
aiDossierRouter.use(requirePostgresAuth);

for (const route of [
  { path: "/leads/:leadId/dossier", params: aiDossierLeadParamsSchema },
  { path: "/customers/:customerId/dossier", params: aiDossierCustomerParamsSchema },
] as const) {
  aiDossierRouter.get(
    route.path,
    validateRequest({ params: route.params, query: aiDossierOutletQuerySchema }),
    withRequestDatabaseContext(getAiDossier),
  );
  aiDossierRouter.post(
    route.path,
    validateRequest({ params: route.params, body: aiDossierRequestSchema }),
    withRequestDatabaseContext(requestAiDossier),
  );
  aiDossierRouter.post(
    `${route.path}/feedback`,
    validateRequest({ params: route.params, body: aiDossierFeedbackSchema }),
    withRequestDatabaseContext(recordAiDossierFeedback),
  );
}
