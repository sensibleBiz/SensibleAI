import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import { AppError } from "../errors/appError.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { getApplicationPool } from "../db/client.js";
import { runWithClientDatabaseContext } from "../db/context.js";
import { normalizeEmail, normalizeMobile } from "../utils/customerNormalization.js";

export const inboundEmailWebhookRouter = Router();

// ============================================================================
// 1. Zod Validation Schema for Cloudflare Worker Payload
// ============================================================================
export const inboundEmailPayloadSchema = z.object({
  to: z.string().min(1, "Recipient address is required"),
  from: z.string().min(1, "Sender address is required"),
  fromName: z.string().optional().default(""),
  subject: z.string().optional().default("(No Subject)"),
  messageId: z.string().optional().default(""),
  date: z.string().optional().default(""),
  rawEmail: z.string().optional().default(""),
  textBody: z.string().optional().default(""),
  htmlBody: z.string().optional().default(""),
});

export type InboundEmailPayload = z.infer<typeof inboundEmailPayloadSchema>;

// ============================================================================
// 2. Webhook Authentication Guard (Pre-shared Token)
// ============================================================================
const requireWebhookSecret: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!configuredSecret) {
    next(new AppError(503, "Inbound email webhook is not configured: INBOUND_EMAIL_WEBHOOK_SECRET must be set", "WEBHOOK_NOT_CONFIGURED"));
    return;
  }
  const providedSecret = req.header("X-Webhook-Secret");
  if (!providedSecret || providedSecret !== configuredSecret) {
    next(new AppError(401, "Invalid or missing X-Webhook-Secret header", "WEBHOOK_UNAUTHORIZED"));
    return;
  }
  next();
};

// ============================================================================
// 3. Helper Parsers (Phone, Name, Clean Content, Google Forwarding Code)
// ============================================================================
const extractPhoneNumber = (text: string): string => {
  // Matches standard Indian mobile numbers (+91-9876543210, 9876543210, etc.)
  const phoneMatch = text.match(/(?:\+91[\-\s]?)?[6-9]\d{9}\b/);
  return phoneMatch?.[0] ?? "";
};

const extractCleanTextBody = (payload: InboundEmailPayload): string => {
  if (payload.textBody && payload.textBody.trim().length > 0) {
    return payload.textBody.trim();
  }
  if (payload.rawEmail && payload.rawEmail.length > 0) {
    // Strip common MIME headers if raw stream was forwarded
    const lines = payload.rawEmail.split(/\r?\n/);
    const bodyStartIndex = lines.findIndex((line) => line.trim() === "");
    if (bodyStartIndex !== -1) {
      return lines.slice(bodyStartIndex + 1).join("\n").trim().slice(0, 4000);
    }
    return payload.rawEmail.slice(0, 4000);
  }
  return payload.subject;
};

const extractStoreIdentifier = (toAddress: string): string => {
  // Examples: store5001@sensibleimpex.com -> store5001
  //           leads+outlet12@sensibleimpex.com -> outlet12
  //           shop-101@sensibleimpex.com -> shop-101
  const parts = toAddress.split("@");
  const localPart = parts[0] ?? "";
  const plusMatch = localPart.match(/\+(.*)$/);
  const plusIdentifier = plusMatch?.[1];
  if (plusIdentifier) {
    return plusIdentifier.trim().toLowerCase();
  }
  return localPart.trim().toLowerCase();
};

// ============================================================================
// 4. Webhook Route Handler
// ============================================================================
inboundEmailWebhookRouter.post(
  ["/", "/inbound-email"],
  requireWebhookSecret,
  validateRequest({ body: inboundEmailPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as InboundEmailPayload;
      const cleanBody = extractCleanTextBody(payload);

      // ------------------------------------------------------------------------
      // Check A: Google Forwarding Verification Email
      // When a customer adds store5001@sensibleimpex.com as forwarding in Gmail,
      // Google sends an automated confirmation code email.
      // ------------------------------------------------------------------------
      if (
        payload.from.includes("forwarding-noreply@google.com") ||
        payload.subject.toLowerCase().includes("forwarding confirmation")
      ) {
        // Google sends: "Confirmation code: 123456789" or "Confirmation code is 123456789"
        const codeMatch =
          cleanBody.match(/confirmation\s+code(?:\s+is)?\s*[:\-]?\s*([0-9]{6,12})/i) ||
          cleanBody.match(/(?:verification|confirmation)[\s\w]*[:\-]?\s*([0-9]{6,12})/i) ||
          (payload.rawEmail ? payload.rawEmail.match(/confirmation\s+code(?:\s+is)?\s*[:\-]?\s*([0-9]{6,12})/i) : null);

        // Google sends a direct verification URL: https://mail.google.com/mail/vf-...
        const urlMatch =
          cleanBody.match(/(https:\/\/(?:mail|mail-settings)\.google\.com\/mail\/vf-[^\s"'<>\n\r]+)/i) ||
          (payload.rawEmail ? payload.rawEmail.match(/(https:\/\/(?:mail|mail-settings)\.google\.com\/mail\/vf-[^\s"'<>\n\r]+)/i) : null);

        const confirmationCode = codeMatch?.[1] ?? null;
        const confirmationUrl = urlMatch?.[1] ?? null;

        // ----------------------------------------------------------------------
        // AUTO-CONFIRMATION: Automatically "click" Google's verification link
        // ----------------------------------------------------------------------
        let autoConfirmed = false;
        if (confirmationUrl) {
          try {
            console.log(`[InboundEmailWebhook] Auto-confirming Google URL for ${payload.to}: ${confirmationUrl}`);
            const pageRes = await fetch(confirmationUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            });
            const pageHtml = await pageRes.text();

            // Extract confirmation form if present
            const formMatch = pageHtml.match(/<form[^>]+action=["']([^"']+)["'][^>]*method=["']post["']/i);
            const formAction = formMatch?.[1];
            const targetAction = formAction
              ? (formAction.startsWith("http") ? formAction : `https://mail.google.com${formAction}`)
              : confirmationUrl;

            // Extract all form inputs (csrf tokens, session states)
            const inputs: Record<string, string> = {};
            const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi;
            let m = inputRegex.exec(pageHtml);
            while (m !== null) {
              const inputKey = m[1];
              const inputValue = m[2];
              if (inputKey && inputValue !== undefined) {
                inputs[inputKey] = inputValue;
              }
              m = inputRegex.exec(pageHtml);
            }

            const postBody = new URLSearchParams(inputs);
            const confirmRes = await fetch(targetAction, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              },
              body: postBody.toString(),
            });

            autoConfirmed = confirmRes.ok || confirmRes.status === 302;
            console.log(`[InboundEmailWebhook] GOOGLE_FORWARDING_AUTO_CONFIRMED status=${confirmRes.status} success=${autoConfirmed}`);
          } catch (autoErr) {
            console.warn("[InboundEmailWebhook] Auto-confirm error (manual confirmation fallback available):", autoErr);
          }
        }

        console.log(`[InboundEmailWebhook] GOOGLE_FORWARDING_VERIFICATION_RECEIVED for ${payload.to}`, {
          confirmationCode,
          confirmationUrl,
          autoConfirmed,
          subject: payload.subject,
        });

        res.status(200).json({
          success: true,
          isVerification: true,
          confirmationCode,
          confirmationUrl,
          autoConfirmed,
          message: autoConfirmed
            ? "Google forwarding automatically confirmed by server"
            : "Google forwarding verification received",
        });
        return;
      }

      // ------------------------------------------------------------------------
      // Check B: Normal Buyer / Customer Lead Processing
      // ------------------------------------------------------------------------
      const targetStoreCode = extractStoreIdentifier(payload.to);
      const extractedPhone = extractPhoneNumber(cleanBody);
      const senderName = payload.fromName.trim() || payload.from.split("@")[0] || "Website Buyer";

      const pool = getApplicationPool();
      const client = await pool.connect();

      try {
        // 1. Resolve Tenant, Business, and Outlet
        // Query by outlet_code, legacy_id, or fallback to the primary active outlet
        const outletQuery = await client.query<{
          id: string;
          tenant_id: string;
          business_id: string;
          name: string;
        }>(
          `SELECT id, tenant_id, business_id, name
           FROM tenancy.outlets
           WHERE active = true
             AND (
               LOWER(outlet_code) = $1
               OR LOWER(name) = $1
               OR id::text = $1
             )
           ORDER BY created_at ASC
           LIMIT 1`,
          [targetStoreCode],
        );

        let outlet = outletQuery.rows[0];

        // If specific outlet is not found, fallback to the first active outlet
        if (!outlet) {
          const fallbackQuery = await client.query<{
            id: string;
            tenant_id: string;
            business_id: string;
            name: string;
          }>(
            `SELECT id, tenant_id, business_id, name
             FROM tenancy.outlets
             WHERE active = true
             ORDER BY created_at ASC
             LIMIT 1`,
          );
          outlet = fallbackQuery.rows[0];
        }

        if (!outlet) {
          throw new AppError(404, "No active outlet or tenant found in system", "OUTLET_NOT_FOUND");
        }

        // 2. Resolve an active user to attribute the creation
        const userQuery = await client.query<{ id: string }>(
          `SELECT id FROM iam.users
           WHERE tenant_id = $1 AND is_active = true
           ORDER BY created_at ASC
           LIMIT 1`,
          [outlet.tenant_id],
        );

        const systemUser = userQuery.rows[0];
        if (!systemUser) {
          throw new AppError(404, "No active user found for tenant", "USER_NOT_FOUND");
        }
        const systemUserId = systemUser.id;

        // 3. Insert Lead Record within Tenant Database Context (RLS Safe)
        const leadId = uuidv7();
        const now = new Date();

        await runWithClientDatabaseContext(
          client,
          {
            tenantId: outlet.tenant_id,
            userId: systemUserId,
            isSuperAdmin: true,
          },
          async ({ client: txClient }) => {
            await txClient.query(
              `INSERT INTO crm.leads (
                id,
                tenant_id,
                business_id,
                outlet_id,
                created_by_user_id,
                updated_by_user_id,
                customer_name,
                business_name,
                mobile,
                normalized_mobile,
                email,
                normalized_email,
                requirement,
                stage,
                source,
                priority,
                comments,
                external_ref,
                created_at,
                updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
              )`,
              [
                leadId,
                outlet.tenant_id,
                outlet.business_id,
                outlet.id,
                systemUserId,
                systemUserId,
                senderName,
                "", // business_name
                extractedPhone,
                normalizeMobile(extractedPhone),
                payload.from,
                normalizeEmail(payload.from),
                cleanBody,
                "NEW",
                "Email Inbound (sensibleimpex.com)",
                "MEDIUM",
                `Subject: ${payload.subject}\nReceived: ${payload.date || now.toISOString()}`,
                payload.messageId || "",
                now,
                now,
              ],
            );
          },
        );

        console.log(`[InboundEmailWebhook] LEAD_CREATED_SUCCESSFULLY leadId=${leadId} outlet=${outlet.name} to=${payload.to}`);

        res.status(200).json({
          success: true,
          leadId,
          outletId: outlet.id,
          outletName: outlet.name,
          message: "Inbound email successfully recorded as CRM lead",
        });
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  },
);

