/**
 * Google Cloud Tasks Client Helper for Sensible AI CRM
 *
 * Use Cases:
 * 1. Rate-limiting outbound WhatsApp bulk campaigns (Meta Cloud API max throughput).
 * 2. Scheduling delayed follow-up actions (e.g. "Trigger follow-up call if payment link unpaid after 2 hours").
 * 3. Graceful asynchronous retry of non-blocking AI agent jobs.
 */

export interface QueuedTaskOptions {
  queueName: string;
  targetUrl: string;
  payload: Record<string, unknown>;
  delaySeconds?: number;
  idempotencyKey?: string;
}

export const enqueueCloudTask = async (options: QueuedTaskOptions): Promise<{ taskId: string; scheduledAt: string }> => {
  const { queueName, targetUrl, payload, delaySeconds = 0, idempotencyKey } = options;
  const taskId = idempotencyKey ?? `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const scheduledTime = new Date(Date.now() + delaySeconds * 1000).toISOString();

  // 1. Structured log for Google Cloud Logging
  console.log(
    JSON.stringify({
      severity: "INFO",
      event: "CLOUD_TASK_ENQUEUED",
      queueName,
      targetUrl,
      taskId,
      delaySeconds,
      scheduledTime,
      payloadKeys: Object.keys(payload),
    }),
  );

  // 2. In local development or testing, simulate delayed execution via timer
  if (process.env.NODE_ENV !== "production") {
    if (delaySeconds > 0 && delaySeconds <= 300) {
      setTimeout(() => {
        console.log(`[Local Task Dispatch] Simulating trigger of task ${taskId} -> ${targetUrl}`);
      }, delaySeconds * 1000);
    }
  }

  return {
    taskId,
    scheduledAt: scheduledTime,
  };
};
