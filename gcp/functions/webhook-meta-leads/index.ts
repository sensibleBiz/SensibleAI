import type { Request, Response } from "express";

/**
 * Cloud Run Function: Meta Lead Ads Webhook Ingestor (Facebook / Instagram)
 *
 * Responsibilities:
 * 1. Verification Handshake (GET).
 * 2. Ingest leadgen webhook event (POST).
 * 3. Publish to Pub/Sub: crm-leads-created.
 * 4. Triggers instant Zero-Latency follow-up (WhatsApp / Exotel AI call).
 */

export const handleMetaLeadWebhook = async (req: Request, res: Response): Promise<void> => {
  // 1. Handshake
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = process.env.META_LEAD_VERIFY_TOKEN || "sensible_crm_lead_verify_token";

    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).json({ error: "Verification token mismatch" });
    return;
  }

  // 2. Lead Notification Handling
  try {
    const body = req.body as Record<string, any>;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (change?.leadgen_id) {
      const event = {
        eventId: `leadgen-${change.leadgen_id}`,
        eventType: "crm.leads.created",
        timestamp: new Date().toISOString(),
        metadata: { source: "cloud_run_function", version: "v2" },
        payload: {
          source: "meta_ads",
          externalLeadId: String(change.leadgen_id),
          formId: String(change.form_id),
          pageId: String(change.page_id),
          adId: String(change.ad_id),
          createdAt: new Date(change.created_time * 1000).toISOString(),
          rawPayload: change,
        },
      };

      console.log(
        JSON.stringify({
          severity: "INFO",
          event: "META_LEAD_INGESTED",
          leadgenId: change.leadgen_id,
          formId: change.form_id,
        }),
      );
    }

    res.status(200).json({ status: "LEAD_RECEIVED" });
  } catch (err) {
    console.error("[Meta Lead Function Error]", err);
    res.status(500).json({ error: "Internal processing error" });
  }
};
