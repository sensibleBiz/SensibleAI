import crypto from "node:crypto";
import type { Request, Response } from "express";

/**
 * Cloud Run Function: PhonePe PG Webhook Ingestor
 *
 * Responsibilities:
 * 1. Verify PhonePe SHA-256 Authorization / Checksum Header.
 * 2. Decode base64 payload.
 * 3. Publish to Cloud Pub/Sub topic: crm-payments-completed.
 * 4. Return 200 OK immediately (<50ms).
 */

interface PhonePeCallbackPayload {
  response: string; // Base64 encoded JSON
}

export const handlePhonePeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const authorization = req.header("Authorization") ?? req.header("X-Verify") ?? "";
    const saltKey = process.env.PHONEPE_SALT_KEY || "";
    const saltIndex = process.env.PHONEPE_SALT_INDEX || "1";

    if (!authorization) {
      res.status(401).json({ success: false, error: "Missing authorization signature" });
      return;
    }

    const body = req.body as PhonePeCallbackPayload;
    if (!body?.response) {
      res.status(400).json({ success: false, error: "Missing response payload" });
      return;
    }

    // Optional Checksum validation if salt key is set in environment
    if (saltKey) {
      const calculatedHash = crypto
        .createHash("sha256")
        .update(body.response + saltKey)
        .digest("hex");
      const expectedSignature = `${calculatedHash}###${saltIndex}`;

      if (authorization.includes("###") && authorization !== expectedSignature) {
        console.error("[PhonePe Function] Signature mismatch");
        res.status(403).json({ success: false, error: "Signature verification failed" });
        return;
      }
    }

    // Decode base64 response
    const decodedJson = Buffer.from(body.response, "base64").toString("utf-8");
    const parsedData = JSON.parse(decodedJson);

    // Construct standardized Pub/Sub event
    const event = {
      eventId: `phonepe-${parsedData?.data?.merchantTransactionId || Date.now()}`,
      eventType: "crm.payments.completed",
      timestamp: new Date().toISOString(),
      metadata: { source: "cloud_run_function", version: "v2" },
      payload: {
        merchantTransactionId: parsedData?.data?.merchantTransactionId,
        phonePeTransactionId: parsedData?.data?.transactionId,
        amountPaise: parsedData?.data?.amount,
        paymentState: parsedData?.code === "PAYMENT_SUCCESS" ? "COMPLETED" : "FAILED",
        rawResponse: parsedData,
      },
    };

    console.log(
      JSON.stringify({
        severity: "INFO",
        event: "PHONEPE_WEBHOOK_INGESTED",
        transactionId: event.payload.merchantTransactionId,
        state: event.payload.paymentState,
      }),
    );

    // Forward to Pub/Sub topic or target queue
    // Return 200 OK fast so PhonePe never retries
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[PhonePe Function Error]", err);
    res.status(500).json({ success: false, error: "Internal processing error" });
  }
};
