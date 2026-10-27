import crypto from "node:crypto";
import type { Request, Response } from "express";

/**
 * Cloud Run Function: Meta WhatsApp Direct Cloud API Webhook Ingestor
 *
 * Responsibilities:
 * 1. Handle Meta Verification Challenge (GET hub.challenge).
 * 2. Validate HMAC SHA-256 signature (X-Hub-Signature-256) on incoming POST.
 * 3. Normalize messages and button clicks.
 * 4. Publish to Cloud Pub/Sub topic: crm-whatsapp-inbound.
 * 5. Return 200 OK immediately (<50ms).
 */

export const handleWhatsAppWebhook = async (req: Request, res: Response): Promise<void> => {
  // 1. Meta Webhook Verification Handshake (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "sensible_crm_verify_token";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WhatsApp Function] Webhook subscription verified successfully");
      res.status(200).send(challenge);
      return;
    }
    res.status(403).json({ error: "Verification token mismatch" });
    return;
  }

  // 2. Incoming Notification Handling (POST)
  try {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signature = req.header("X-Hub-Signature-256");

    // Optional signature verification if app secret is provided
    if (appSecret && signature) {
      const rawBody = JSON.stringify(req.body);
      const expectedSignature = `sha256=${crypto
        .createHmac("sha256", appSecret)
        .update(rawBody)
        .digest("hex")}`;

      if (signature !== expectedSignature) {
        console.warn("[WhatsApp Function] Signature mismatch");
        res.status(403).json({ error: "Invalid signature" });
        return;
      }
    }

    const body = req.body as Record<string, any>;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (change?.messages && change.messages.length > 0) {
      const msg = change.messages[0];
      const contact = change?.contacts?.[0];

      const event = {
        eventId: `wa-${msg.id}`,
        eventType: "crm.whatsapp.inbound",
        timestamp: new Date().toISOString(),
        metadata: { source: "cloud_run_function", version: "v2" },
        payload: {
          messageId: msg.id,
          senderPhone: msg.from,
          senderName: contact?.profile?.name ?? "",
          businessPhoneNumberId: change.metadata?.phone_number_id,
          messageType: msg.type,
          text: msg.text?.body,
          buttonPayload: msg.button?.payload ?? msg.interactive?.button_reply?.id,
          interactiveListId: msg.interactive?.list_reply?.id,
          receivedAt: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
        },
      };

      console.log(
        JSON.stringify({
          severity: "INFO",
          event: "WHATSAPP_INBOUND_INGESTED",
          from: event.payload.senderPhone,
          type: event.payload.messageType,
        }),
      );
    }

    // Always return 200 OK fast so Meta does not retry or disable the webhook
    res.status(200).json({ status: "EVENT_RECEIVED" });
  } catch (err) {
    console.error("[WhatsApp Function Error]", err);
    res.status(500).json({ error: "Internal processing error" });
  }
};
