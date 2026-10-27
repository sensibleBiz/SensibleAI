import { Router } from "express";
import {
  checkOnboardingPhoneNumber,
  createBusinessOnboarding,
  getOnboardingStatus,
} from "../controllers/onboarding.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  businessOnboardingSchema,
  onboardingPhoneCheckSchema,
} from "../validators/onboarding.validator.js";
import {
  claimQrSession,
  exchangeQrSession,
  getQrSession,
} from "../modules/auth/qr-session.controller.js";
import { qrSessionParamsSchema } from "../modules/auth/qr-session.validator.js";

export const sessionRouter = Router();

sessionRouter.get(
  "/qr-sessions/:sessionId",
  validateRequest({ params: qrSessionParamsSchema }),
  getQrSession,
);
sessionRouter.post(
  "/qr-sessions/:sessionId/claim",
  requireAuth,
  validateRequest({ params: qrSessionParamsSchema }),
  claimQrSession,
);
sessionRouter.post(
  "/qr-sessions/:sessionId/exchange",
  validateRequest({ params: qrSessionParamsSchema }),
  exchangeQrSession,
);

sessionRouter.post(
  "/onboarding/check-phone",
  validateRequest({ body: onboardingPhoneCheckSchema }),
  checkOnboardingPhoneNumber,
);

sessionRouter.get("/onboarding/status", requireAuth, getOnboardingStatus);
sessionRouter.post(
  "/onboarding/business",
  requireAuth,
  validateRequest({ body: businessOnboardingSchema }),
  createBusinessOnboarding,
);
