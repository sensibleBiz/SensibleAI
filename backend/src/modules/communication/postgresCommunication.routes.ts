import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requirePostgresAuth } from "../../middleware/postgresAuth.js";
import { withDatabaseContext } from "../../db/context.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { sendSesEmail } from "./sesEmail.service.js";
import { AppError } from "../../errors/appError.js";
import { usageService } from "../billing/usage.service.js";

export const postgresCommunicationRouter = Router();
            
const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().trim().min(1, "Subject is required"),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  // outletId enables usage metering; omit for system emails that should not
  // consume credits (e.g. auth notifications, internal alerts).
  outletId: z.string().uuid().optional(),
});

/**
 * POST /api/communication/send-email
 * Dispatch outbound transactional or sales email via Amazon SES
 */
postgresCommunicationRouter.post(
  "/send-email",
  requirePostgresAuth,
  validateRequest({ body: sendEmailSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to, subject, html, text, replyTo, outletId } = req.body;

      if (!html && !text) {
        throw new AppError(400, "Either 'html' or 'text' content must be provided", "VALIDATION_ERROR");
      }

      // Send via SES (external call — never inside an open DB transaction).
      const result = await sendSesEmail({ to, subject, html, text, replyTo });

      if (!result.success) {
        throw new AppError(500, result.error || "Failed to send email via Amazon SES", "EMAIL_SEND_FAILED");
      }

      // Post-send metering: bill only when outletId is provided and the send succeeded.
      // If billing fails here the email has already been dispatched; a structured
      // warning is logged but the HTTP 200 is still returned so the caller's
      // send operation is not retroactively failed. See usage.service.ts for
      // the documented reconciliation gap and remediation notes.
      if (outletId && result.messageId) {
        const auth = req.postgresAuth;
        if (auth) {
          try {
            await withDatabaseContext({ tenantId: auth.tenantId, userId: auth.userId }, async (db) => {
              await usageService.meterUsage(db, {
                tenantId: auth.tenantId,
                outletId,
                serviceType: "email.ses",
                quantity: "1.0000",
                idempotencyKey: `ses:${result.messageId}`,
                actorUserId: auth.userId,
                ...(result.messageId !== undefined ? { providerRef: result.messageId } : {}),
                provider: "aws",
                metadata: { subject },
              });
            });
          } catch (billingError) {
            // Log but do not fail the HTTP response — the email was already sent.
            // Structured log enables reconciliation.
            console.warn(JSON.stringify({
              severity: "WARN",
              event: "EMAIL_BILLING_FAILED_AFTER_SEND",
              tenantId: auth.tenantId,
              outletId,
              sesMessageId: result.messageId,
              error: billingError instanceof Error ? billingError.message : String(billingError),
            }));
          }
        }
      }

      res.status(200).json({ success: true, messageId: result.messageId });
    } catch (error) {
      next(error);
    }
  },
);

