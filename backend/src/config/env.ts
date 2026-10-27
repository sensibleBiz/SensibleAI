import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(backendDirectory, ".env.local-private") });
dotenv.config({ path: path.join(backendDirectory, ".env") });

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

const optionalUuid = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().uuid().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    CORS_ORIGINS: optionalString,
    FIREBASE_PROJECT_ID: optionalString,
    FIREBASE_CLIENT_EMAIL: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().email().optional(),
    ),
    FIREBASE_PRIVATE_KEY: optionalString,
    DATACONNECT_PROJECT_ID: z.string().trim().default("sensiblecrm"),
    DATACONNECT_SERVICE_ID: z.string().trim().default("sensiblecrm-service"),
    DATACONNECT_LOCATION: z.string().trim().default("asia-south1"),
    DATACONNECT_CLIENT_EMAIL: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().email().optional(),
    ),
    DATACONNECT_PRIVATE_KEY: optionalString,
    WHATSAPP_INTEGRATED_NUMBER: optionalString,
    WHATSAPP_MSG91_AUTH_KEY: optionalString,
    WHATSAPP_API_URL: optionalString,
    WHATSAPP_MESSAGE_API_URL: optionalString,
    GOOGLE_API_KEY: optionalString,
    GEMINI_API_KEY: optionalString,
    GOOGLE_GENAI_USE_ENTERPRISE: z.enum(["true", "false"]).optional(),
    GOOGLE_GENAI_USE_VERTEXAI: z.enum(["true", "false"]).default("false"),
    GOOGLE_CLOUD_PROJECT: optionalString,
    GOOGLE_CLOUD_LOCATION: optionalString,
    CRM_ASSISTANT_MODEL: z.string().trim().default("gemini-3.8-flash"),
    AI_RETRIEVAL_ENABLED: z.enum(["true", "false"]).default("false"),
    AI_AGENT_ACTIONS_ENABLED: z.enum(["true", "false"]).default("false"),
    AI_EMBEDDING_PROVIDER: z.enum(["google", "disabled"]).default("google"),
    AI_EMBEDDING_MODEL: z.string().trim().default("models/gemini-embedding-001"),
    AI_EMBEDDING_MODEL_VERSION: z.string().trim().default("gemini-embedding-001-768-v1"),
    AI_EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
    AI_CUSTOMER_DOSSIERS_ENABLED: z.enum(["true", "false"]).default("false"),
    AI_DOSSIER_SYNTHESIS_MODEL: z.string().trim().default("gemini-3.8-flash"),
    AI_DOSSIER_MODEL_VERSION: z.string().trim().default("gemini-3.8-flash-dossier-v1"),
    AI_DOSSIER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    AI_DOSSIER_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8_192).default(2_048),
    AI_DOSSIER_MAX_INPUT_CHARS: z.coerce.number().int().min(2_000).max(50_000).default(16_000),
    AI_DOSSIER_MAX_JOBS_PER_RUN: z.coerce.number().int().min(1).max(500).default(25),
    AI_DOSSIER_MAX_DAILY_PER_OUTLET: z.coerce.number().int().min(1).max(10_000).default(50),
    AI_DOSSIER_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
    AI_DOSSIER_INPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).default(0),
    AI_DOSSIER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).default(0),
    DATABASE_URL: optionalString,
    DATABASE_ADMIN_URL: optionalString,
    JWT_ACCESS_SECRET: optionalString,
    JWT_REFRESH_SECRET: optionalString,
    JWT_ISSUER: z.string().trim().default("sensible-crm-api"),
    JWT_AUDIENCE: z.string().trim().default("sensible-crm"),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).max(60 * 60 * 24 * 90).default(2_592_000),
    BIOMETRIC_INGEST_TOKEN: optionalString,
    PHONEPE_OFFLINE_TEST_HOST_URL: optionalString,
    PHONEPE_OFFLINE_PROD_HOST_URL: optionalString,
    PHONEPE_OFFLINE_SALT_KEY_TEST: optionalString,
    PHONEPE_OFFLINE_SALT_KEY_PROD: optionalString,
    PHONEPE_OFFLINE_MERCHANT_ID_TEST: optionalString,
    PHONEPE_OFFLINE_MERCHANT_ID_PROD: optionalString,
    PHONEPE_OFFLINE_STORE_ID_TEST: optionalString,
    PHONEPE_OFFLINE_STORE_ID_PROD: optionalString,
    PHONEPE_OFFLINE_TERMINAL_ID_TEST: optionalString,
    PHONEPE_OFFLINE_TERMINAL_ID_PROD: optionalString,
    PHONEPE_OFFLINE_PROVIDER_ID_TEST: optionalString,
    PHONEPE_OFFLINE_PROVIDER_ID_PROD: optionalString,
    PHONEPE_OFFLINE_CALLBACK_URL: optionalString,
    PHONEPE_OFFLINE_SALT_INDEX: z.preprocess(
      (value) => (value === undefined || value === "" ? "1" : value),
      z.string().trim().default("1"),
    ),
    EVENT_INVOICE_API_URL: optionalString,
    EVENT_WHATSAPP_TEMPLATE_NAME: z.string().trim().default("sendevent"),
    EVENT_WHATSAPP_TEMPLATE_NAMESPACE: optionalString,
    EVENT_MSG91_WHATSAPP_BULK_URL: optionalString,
    BIOMAX_API_BASE_URL: optionalString,
    BIOMAX_DEFAULT_BIOMETRIC_ID: optionalString,
    BIOMAX_POLL_DEFAULT_OUTLET_ID: optionalString,
    BIOMETRIC_POSTGRES_OUTLET_ID: optionalString,
    EVENT_GATEWAY_API_KEY: optionalString,
    // ── PhonePe Payment Gateway (PG) — online wallet top-ups ──────────────────
    // Separate from PHONEPE_OFFLINE_* (Offline POS for event payments).
    // Do NOT mix these credential sets.
    PHONEPE_PG_ENABLED: z.enum(["true", "false"]).default("false"),
    PHONEPE_PG_PRODUCTION_ENABLED: z.enum(["true", "false"]).default("false"),
    PHONEPE_PG_CLIENT_ID_TEST: optionalString,
    PHONEPE_PG_CLIENT_SECRET_TEST: optionalString,
    PHONEPE_PG_CLIENT_VERSION_TEST: optionalString,
    PHONEPE_PG_CLIENT_ID_PROD: optionalString,
    PHONEPE_PG_CLIENT_SECRET_PROD: optionalString,
    PHONEPE_PG_CLIENT_VERSION_PROD: optionalString,
    PHONEPE_PG_WEBHOOK_USERNAME_TEST: optionalString,
    PHONEPE_PG_WEBHOOK_PASSWORD_TEST: optionalString,
    PHONEPE_PG_WEBHOOK_USERNAME_PROD: optionalString,
    PHONEPE_PG_WEBHOOK_PASSWORD_PROD: optionalString,
    // A compatibility tripwire only. Standard Checkout v1 is not implemented
    // and setting this true makes the v2 adapter fail closed.
    PHONEPE_PG_LEGACY_V1_ENABLED: z.enum(["true", "false"]).default("false"),
    PHONEPE_PG_REDIRECT_URL: optionalString,
    PHONEPE_PG_CALLBACK_URL: optionalString,
    // Credit conversion: how many credits per 1 INR. Must be set explicitly
    // before top-ups can be initiated. No default — unresolved business decision.
    PHONEPE_PG_CREDITS_PER_INR: optionalString,
    PHONEPE_PG_MIN_AMOUNT_INR: z.coerce.number().int().min(1).default(100),
    PHONEPE_PG_MAX_AMOUNT_INR: z.coerce.number().int().min(1).default(50000),
    // The Sensible AI internal platform tenant. Admin mutations on global rate cards
    // are restricted to users who are tenant admins of this specific tenant.
    // Must be a valid UUID. Required before rate-card admin is used in production.
    BILLING_PLATFORM_ADMIN_TENANT_ID: optionalUuid,
    SEARCH_V2_ENABLED: z.enum(["true", "false"]).default("false"),
    AWS_REGION: z.string().trim().default("ap-southeast-2"),
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    SES_FROM_EMAIL: z.string().trim().email().default("communications@sensible.biz"),
  })
  .superRefine((value, context) => {
    const hasClientEmail = Boolean(value.FIREBASE_CLIENT_EMAIL);
    const hasPrivateKey = Boolean(value.FIREBASE_PRIVATE_KEY);
    const hasPartialCredentials = hasClientEmail !== hasPrivateKey;
    const credentialsMissingProject =
      hasClientEmail && hasPrivateKey && !value.FIREBASE_PROJECT_ID;

    if (hasPartialCredentials || credentialsMissingProject) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be supplied together",
        path: ["FIREBASE_CLIENT_EMAIL"],
      });
    }
    const hasDataConnectClientEmail = Boolean(value.DATACONNECT_CLIENT_EMAIL);
    const hasDataConnectPrivateKey = Boolean(value.DATACONNECT_PRIVATE_KEY);
    if (hasDataConnectClientEmail !== hasDataConnectPrivateKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "DATACONNECT_CLIENT_EMAIL and DATACONNECT_PRIVATE_KEY must be supplied together",
        path: ["DATACONNECT_CLIENT_EMAIL"],
      });
    }
    if (value.NODE_ENV === "production") {
      for (const key of ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
        const secret = value[key];
        if (!secret || (key !== "DATABASE_URL" && secret.length < 32)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: key === "DATABASE_URL" ? `${key} is required in production` : `${key} must be at least 32 characters in production`,
            path: [key],
          });
        }
      }
      if (
        (value.GOOGLE_GENAI_USE_ENTERPRISE ?? value.GOOGLE_GENAI_USE_VERTEXAI) === "true" &&
        (!value.GOOGLE_CLOUD_PROJECT || !value.GOOGLE_CLOUD_LOCATION)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are required when GOOGLE_GENAI_USE_ENTERPRISE=true",
          path: ["GOOGLE_CLOUD_PROJECT"],
        });
      }
      if (value.JWT_ACCESS_SECRET && value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT access and refresh secrets must be different",
          path: ["JWT_REFRESH_SECRET"],
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const reasons = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid backend environment: ${reasons}`);
}

const values = parsedEnv.data;
const defaultCorsOrigins = [
  "https://aicrm.sensible.biz",
  "https://pro-aicrm.web.app",
  "https://pro-aicrm.firebaseapp.com",
  "https://exports.sensible.biz",
  "https://pro-exports.web.app",
  "https://pro-exports.firebaseapp.com",
  "https://accounts.sensible.biz",
  "https://pro-accounts-c3399.web.app",
  "https://pro-accounts-c3399.firebaseapp.com",
  "https://sales.sensible.biz",
  "https://pro-crm.web.app",
  "https://pro-crm.firebaseapp.com",
  "http://localhost:5173",
  "https://localhost:5173",
];
const configuredCorsOrigins =
  values.CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

export const env = {
  nodeEnv: values.NODE_ENV,
  port: values.PORT,
  corsOrigins: [...new Set([...defaultCorsOrigins, ...configuredCorsOrigins])],
  googleAi: {
    apiKey: values.GOOGLE_API_KEY || values.GEMINI_API_KEY,
    useEnterprise:
      (values.GOOGLE_GENAI_USE_ENTERPRISE ?? values.GOOGLE_GENAI_USE_VERTEXAI) === "true",
    project: values.GOOGLE_CLOUD_PROJECT,
    location: values.GOOGLE_CLOUD_LOCATION,
    assistantModel: values.CRM_ASSISTANT_MODEL,
  },
  aiRetrieval: {
    enabled: values.AI_RETRIEVAL_ENABLED === "true",
    embeddingProvider: values.AI_EMBEDDING_PROVIDER,
    embeddingModel: values.AI_EMBEDDING_MODEL,
    embeddingModelVersion: values.AI_EMBEDDING_MODEL_VERSION,
    embeddingTimeoutMs: values.AI_EMBEDDING_TIMEOUT_MS,
  },
  aiAgentActionsEnabled: values.AI_AGENT_ACTIONS_ENABLED === "true",
  aiDossiers: {
    enabled: values.AI_CUSTOMER_DOSSIERS_ENABLED === "true",
    provider: "google" as const,
    model: values.AI_DOSSIER_SYNTHESIS_MODEL,
    modelVersion: values.AI_DOSSIER_MODEL_VERSION,
    timeoutMs: values.AI_DOSSIER_TIMEOUT_MS,
    maxOutputTokens: values.AI_DOSSIER_MAX_OUTPUT_TOKENS,
    maxInputChars: values.AI_DOSSIER_MAX_INPUT_CHARS,
    maxJobsPerRun: values.AI_DOSSIER_MAX_JOBS_PER_RUN,
    maxDailyPerOutlet: values.AI_DOSSIER_MAX_DAILY_PER_OUTLET,
    retentionDays: values.AI_DOSSIER_RETENTION_DAYS,
    inputCostMicrosPerMillionTokens: values.AI_DOSSIER_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    outputCostMicrosPerMillionTokens: values.AI_DOSSIER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
  },
  firebase: {
    projectId: values.FIREBASE_PROJECT_ID,
    clientEmail: values.FIREBASE_CLIENT_EMAIL,
    privateKey: values.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  dataConnect: {
    projectId: values.DATACONNECT_PROJECT_ID,
    serviceId: values.DATACONNECT_SERVICE_ID,
    location: values.DATACONNECT_LOCATION,
    clientEmail: values.DATACONNECT_CLIENT_EMAIL,
    privateKey: values.DATACONNECT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  whatsapp: {
    integratedNumber: values.WHATSAPP_INTEGRATED_NUMBER || "918669966793",
    authKey: values.WHATSAPP_MSG91_AUTH_KEY,
    apiUrl:
      values.WHATSAPP_API_URL ||
      "https://asia-south1-sensiblebizpro.cloudfunctions.net/msg91Whatsapp/send_whatsapp_bulk",
    messageApiUrl:
      values.WHATSAPP_MESSAGE_API_URL ||
      "https://asia-south1-sensiblebizpro.cloudfunctions.net/msg91Whatsapp/send_msg_whatsapp",
  },
  database: {
    url: values.DATABASE_URL,
    adminUrl: values.DATABASE_ADMIN_URL,
  },
  jwt: {
    accessSecret: values.JWT_ACCESS_SECRET,
    refreshSecret: values.JWT_REFRESH_SECRET,
    issuer: values.JWT_ISSUER,
    audience: values.JWT_AUDIENCE,
    accessTtlSeconds: values.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: values.JWT_REFRESH_TTL_SECONDS,
  },
  biometric: {
    ingestToken: values.BIOMETRIC_INGEST_TOKEN,
    biomax: {
      apiBaseUrl: values.BIOMAX_API_BASE_URL || "http://www.biomaxpay.com/api/MobileApp",
      defaultBiometricId: values.BIOMAX_DEFAULT_BIOMETRIC_ID || "9768",
      defaultOutletId: values.BIOMAX_POLL_DEFAULT_OUTLET_ID || "uefD786xcJf9DxgLUm0U",
    },
    postgresOutletId: values.BIOMETRIC_POSTGRES_OUTLET_ID || "",
  },
  search: {
    v2Enabled: values.SEARCH_V2_ENABLED === "true",
  },
  events: {
    gatewayApiKey: values.EVENT_GATEWAY_API_KEY,
    invoiceApiUrl:
      values.EVENT_INVOICE_API_URL ||
      "https://event-invoice-401022448274.asia-south1.run.app/helloHttp",
    phonePe: {
      testHostUrl: values.PHONEPE_OFFLINE_TEST_HOST_URL || "https://mercury-uat.phonepe.com/enterprise-sandbox",
      prodHostUrl: values.PHONEPE_OFFLINE_PROD_HOST_URL || "https://mercury-t2.phonepe.com",
      intentPath: "/v1/intent/init",
      statusPathPrefix: "/v3/transaction/",
      saltKeyTest: values.PHONEPE_OFFLINE_SALT_KEY_TEST || "",
      saltKeyProd: values.PHONEPE_OFFLINE_SALT_KEY_PROD || "",
      merchantIdTest: values.PHONEPE_OFFLINE_MERCHANT_ID_TEST || "SENSIBLECONNECTUATV1",
      merchantIdProd: values.PHONEPE_OFFLINE_MERCHANT_ID_PROD || "SENSIBLECONNECTOFFLINE",
      storeIdTest: values.PHONEPE_OFFLINE_STORE_ID_TEST || "TESTSTORE1",
      storeIdProd: values.PHONEPE_OFFLINE_STORE_ID_PROD || "",
      terminalIdTest: values.PHONEPE_OFFLINE_TERMINAL_ID_TEST || "testterminal1",
      terminalIdProd: values.PHONEPE_OFFLINE_TERMINAL_ID_PROD || "",
      providerIdTest: values.PHONEPE_OFFLINE_PROVIDER_ID_TEST || "SENSIBLECONNECTPROVIDERV1",
      providerIdProd: values.PHONEPE_OFFLINE_PROVIDER_ID_PROD || "SENSIBLECONNECTPOS",
      callbackUrl: values.PHONEPE_OFFLINE_CALLBACK_URL || "",
      saltIndex: values.PHONEPE_OFFLINE_SALT_INDEX,
    },
    whatsapp: {
      integratedNumber: values.WHATSAPP_INTEGRATED_NUMBER || "918669966793",
      authKey: values.WHATSAPP_MSG91_AUTH_KEY || "",
      bulkUrl:
        values.EVENT_MSG91_WHATSAPP_BULK_URL ||
        "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
      templateName: values.EVENT_WHATSAPP_TEMPLATE_NAME,
      templateNamespace: values.EVENT_WHATSAPP_TEMPLATE_NAMESPACE || "2e4d015f_c553_4dbb_aa09_17f256d6d388",
    },
  },
  aws: {
    region: values.AWS_REGION,
    accessKeyId: values.AWS_ACCESS_KEY_ID,
    secretAccessKey: values.AWS_SECRET_ACCESS_KEY,
    sesFromEmail: values.SES_FROM_EMAIL,
  },
  billing: {
    // PhonePe Payment Gateway (PG) — online wallet top-ups.
    // Strictly separate from events.phonePe (Offline POS).
    phonePePg: {
      enabled: values.PHONEPE_PG_ENABLED === "true",
      productionEnabled: values.PHONEPE_PG_PRODUCTION_ENABLED === "true",
      clientIdTest: values.PHONEPE_PG_CLIENT_ID_TEST ?? "",
      clientSecretTest: values.PHONEPE_PG_CLIENT_SECRET_TEST ?? "",
      clientVersionTest: values.PHONEPE_PG_CLIENT_VERSION_TEST ?? "",
      clientIdProd: values.PHONEPE_PG_CLIENT_ID_PROD ?? "",
      clientSecretProd: values.PHONEPE_PG_CLIENT_SECRET_PROD ?? "",
      clientVersionProd: values.PHONEPE_PG_CLIENT_VERSION_PROD ?? "",
      webhookUsernameTest: values.PHONEPE_PG_WEBHOOK_USERNAME_TEST ?? "",
      webhookPasswordTest: values.PHONEPE_PG_WEBHOOK_PASSWORD_TEST ?? "",
      webhookUsernameProd: values.PHONEPE_PG_WEBHOOK_USERNAME_PROD ?? "",
      webhookPasswordProd: values.PHONEPE_PG_WEBHOOK_PASSWORD_PROD ?? "",
      legacyV1Enabled: values.PHONEPE_PG_LEGACY_V1_ENABLED === "true",
      redirectUrl: values.PHONEPE_PG_REDIRECT_URL ?? "",
      callbackUrl: values.PHONEPE_PG_CALLBACK_URL ?? "",
      creditsPerInr: values.PHONEPE_PG_CREDITS_PER_INR ?? null,
      minAmountInr: values.PHONEPE_PG_MIN_AMOUNT_INR,
      maxAmountInr: values.PHONEPE_PG_MAX_AMOUNT_INR,
      platformAdminTenantId: values.BILLING_PLATFORM_ADMIN_TENANT_ID ?? null,
      sandboxOauthUrl: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
      prodOauthUrl: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
      sandboxApiBaseUrl: "https://api-preprod.phonepe.com/apis/pg-sandbox",
      prodApiBaseUrl: "https://api.phonepe.com/apis/pg",
    },
  },
};
