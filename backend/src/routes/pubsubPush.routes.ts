import { Router, type Request, type Response } from "express";
import { topUpService } from "../modules/billing/topUp.service.js";
import type { AnyCrmEvent } from "../gcp/pubsub/types.js";

export const pubsubPushRouter = Router();

/**
 * POST /api/v1/pubsub/push
 * Receiver endpoint for Google Cloud Pub/Sub Push Subscriptions.
 * Cloud Pub/Sub delivers messages as HTTP POST with base64 encoded data.
 */
pubsubPushRouter.post("/push", async (req: Request, res: Response): Promise<void> => {
  try {
    const pubsubMessage = req.body?.message;

    if (!pubsubMessage || !pubsubMessage.data) {
      console.warn("[Pub/Sub Push] Received empty or invalid push message");
      // Return 200 to acknowledge and drop bad messages, avoiding infinite retries
      res.status(200).send("No message data");
      return;
    }

    // 1. Decode base64 payload from Pub/Sub
    const rawData = Buffer.from(pubsubMessage.data, "base64").toString("utf-8");
    const event = JSON.parse(rawData) as AnyCrmEvent;

    console.log(
      JSON.stringify({
        severity: "INFO",
        event: "PUBSUB_PUSH_RECEIVED",
        eventType: event.eventType,
        eventId: event.eventId,
        messageId: pubsubMessage.messageId,
      }),
    );

    // 2. Event Dispatcher
    switch (event.eventType) {
      case "crm.payments.completed": {
        const payload = event.payload;
        if (payload.tenantId && payload.userId && payload.outletId && payload.orderId) {
          await topUpService.verifyAndCreditTopUp(
            payload.tenantId,
            payload.userId,
            payload.outletId,
            payload.orderId,
          );
          console.log(`[Pub/Sub Push] Top-up credited successfully for order ${payload.orderId}`);
        }
        break;
      }

      case "crm.whatsapp.inbound": {
        const payload = event.payload;
        console.log(`[Pub/Sub Push] Processing incoming WhatsApp message from ${payload.senderPhone}: "${payload.text ?? ''}"`);
        // Trigger automated response, AI assistant, or timeline recording
        break;
      }

      case "crm.leads.created": {
        const payload = event.payload;
        console.log(`[Pub/Sub Push] Processing newly ingested lead: ${payload.fullName} (${payload.phone})`);
        // Lead insertion and workflow trigger
        break;
      }

      case "crm.calls.completed": {
        const payload = event.payload;
        console.log(`[Pub/Sub Push] Call completed: ${payload.callSid}, duration: ${payload.durationSeconds}s`);
        break;
      }

      default:
        console.log(`[Pub/Sub Push] Unhandled event type: ${(event as any).eventType}`);
        break;
    }

    // Acknowledge Pub/Sub receipt with 200 OK
    res.status(200).json({ success: true, processed: true, eventId: event.eventId });
  } catch (error) {
    console.error("[Pub/Sub Push Handler Error]", error);
    // Returning 500 signals Pub/Sub to retry with exponential backoff
    res.status(500).json({ success: false, error: "Pub/Sub event processing failed" });
  }
});
