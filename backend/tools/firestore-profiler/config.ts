import path from "node:path";

const intValue = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
};

export const ROOT_COLLECTIONS = ["BUSINESSS_MASTER", "OUTLET", "USER_PROFILE", "QR_SESSIONS"] as const;
export const OUTLET_SUBCOLLECTIONS = [
  "TEAM_TREE", "MODULE_SUBSCRIPTION", "LEADS_MANAGEMENT", "LEAD_SHARE_TOKENS",
  "CUSTOMERS", "CUSTOMER_IDENTITIES", "LEAD_ACTIVITIES", "CALL_LOGS", "ATTENDANCE",
  "LEAVE_APPLICATION", "LEAVE_BALANCE", "LEAVE_TYPE", "HOLIDAY", "SALARY_MASTER",
  "PAYROLL", "EXPENSE", "EXPENSE_BUDGET", "PRODUCT", "CATEGORY", "TRANSFER_REQUEST",
  "TRACKING_HISTORY", "WHATSAPP_MESSAGES", "AUTOLEAD_ASSIGN", "ContactKeyword", "CONTACTS", "SHIFT",
] as const;

export const EXPECTED_COLLECTIONS = [...ROOT_COLLECTIONS, ...OUTLET_SUBCOLLECTIONS];

export interface ProfilerConfig {
  projectId: string;
  environment: string;
  profileMode: string;
  batchSize: number;
  pauseMs: number;
  outputDirectory: string;
  largeDocumentBytes: number;
  largeArrayLength: number;
  orphanSampleLimit: number;
}

export function loadProfilerConfig(): ProfilerConfig {
  const projectId = process.env.PROFILE_PROJECT_ID?.trim() ?? "";
  const outputDirectory = path.resolve(process.env.PROFILE_OUTPUT_DIR ?? "artifacts/firestore-profile");
  return {
    projectId,
    environment: process.env.PROFILE_ENVIRONMENT?.trim() ?? "",
    profileMode: process.env.PROFILE_MODE?.trim() ?? "",
    batchSize: intValue("PROFILE_BATCH_SIZE", 250),
    pauseMs: intValue("PROFILE_PAUSE_MS", 100),
    outputDirectory,
    largeDocumentBytes: intValue("PROFILE_LARGE_DOCUMENT_BYTES", 800_000),
    largeArrayLength: intValue("PROFILE_LARGE_ARRAY_LENGTH", 1_000),
    orphanSampleLimit: intValue("PROFILE_ORPHAN_SAMPLE_LIMIT", 20),
  };
}

export function assertSafeConfiguration(config: ProfilerConfig): void {
  const failures: string[] = [];
  if (!config.projectId) failures.push("PROFILE_PROJECT_ID must be explicitly provided");
  if (config.environment !== "production-profiling" && config.environment !== "test-profiling") {
    failures.push("PROFILE_ENVIRONMENT must be production-profiling or test-profiling");
  }
  if (config.profileMode !== "READ_ONLY") failures.push("PROFILE_MODE must be exactly READ_ONLY");
  if (config.batchSize < 1 || config.batchSize > 250) failures.push("PROFILE_BATCH_SIZE must be between 1 and 250");
  if (config.pauseMs < 100) failures.push("PROFILE_PAUSE_MS must be at least 100");
  if (!config.outputDirectory) failures.push("PROFILE_OUTPUT_DIR must be configured");
  if (process.env.FIRESTORE_EMULATOR_HOST && config.environment === "production-profiling") {
    failures.push("FIRESTORE_EMULATOR_HOST must be disabled for production profiling");
  }
  if (failures.length) throw new Error(`Profiler safety preflight failed:\n- ${failures.join("\n- ")}`);
}

export function safetySummary(config: ProfilerConfig): string {
  return [
    "Firestore profiler safety preflight: PASS",
    `Project ID: ${config.projectId}`,
    `Environment: ${config.environment}`,
    `Mode: ${config.profileMode}`,
    `Batch size: ${config.batchSize}`,
    `Pause: ${config.pauseMs}ms`,
    `Output: ${config.outputDirectory}`,
    "Write APIs imported: no",
    "Credential value logging: disabled",
    `Emulator: ${process.env.FIRESTORE_EMULATOR_HOST ? "enabled" : "disabled"}`,
  ].join("\n");
}

