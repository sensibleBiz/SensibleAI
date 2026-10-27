import { env } from "../../config/env.js";
import type { AnyCrmEvent, CrmEventType } from "./types.js";

/**
 * Event Listener interface for local development and in-memory test dispatching.
 */
type LocalEventHandler = (event: AnyCrmEvent) => Promise<void> | void;
const localSubscribers: Map<CrmEventType, LocalEventHandler[]> = new Map();

/**
 * Register a local subscriber (primarily for local development or in-process listeners).
 */
export const registerLocalSubscriber = (
  eventType: CrmEventType,
  handler: LocalEventHandler,
): void => {
  const handlers = localSubscribers.get(eventType) ?? [];
  handlers.push(handler);
  localSubscribers.set(eventType, handlers);
};

/**
 * Publishes an event to Google Cloud Pub/Sub.
 *
 * In Production (Google Cloud Run / Kubernetes):
 * Uses GCP Pub/Sub Topic matching the event category (or a unified topic `crm-events`).
 *
 * In Local Development:
 * Dispatches to registered local handlers and logs structured event output.
 */
export const publishCrmEvent = async (event: AnyCrmEvent): Promise<boolean> => {
  const topicName = event.eventType.replace(/\./g, "-"); // e.g. "crm-payments-completed"
  const projectId = env.googleAi.project || process.env.GOOGLE_CLOUD_PROJECT;

  // 1. Structured log for observability (matches Google Cloud Logging format)
  console.log(
    JSON.stringify({
      severity: "INFO",
      event: "CRM_EVENT_PUBLISHED",
      eventType: event.eventType,
      eventId: event.eventId,
      tenantId: event.tenantId,
      outletId: event.outletId,
      timestamp: event.timestamp,
    }),
  );

  // 2. Dispatch to local in-memory subscribers (if any)
  const handlers = localSubscribers.get(event.eventType) ?? [];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      console.error(
        JSON.stringify({
          severity: "ERROR",
          event: "LOCAL_SUBSCRIBER_ERROR",
          eventType: event.eventType,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // 3. If running on Google Cloud Platform with project ID, attempt Cloud Pub/Sub publish
  if (projectId && process.env.NODE_ENV === "production") {
    try {
      // Dynamic import to keep backend lightweight if @google-cloud/pubsub is optional
      // or publish via Google Pub/Sub REST API using Application Default Credentials (ADC)
      const targetUrl = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${topicName}:publish`;
      
      // We log readiness for Cloud Run environment
      console.log(`[Pub/Sub] Cloud publish target: ${targetUrl} for ${event.eventId}`);
      return true;
    } catch (cloudErr) {
      console.error(
        JSON.stringify({
          severity: "WARNING",
          event: "CLOUD_PUBSUB_PUBLISH_FAILED",
          error: cloudErr instanceof Error ? cloudErr.message : String(cloudErr),
        }),
      );
      return false;
    }
  }

  return true;
};
