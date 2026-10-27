export interface GoogleAiEnvironmentConfig {
  apiKey?: string | undefined;
  useEnterprise: boolean;
  project?: string | undefined;
  location?: string | undefined;
}

/**
 * Give the Google SDK one canonical credential and API-selection flag.
 * The SDK warns when both supported API-key aliases are present, and its
 * deprecated Vertex flag is intentionally removed after legacy config has
 * been resolved by config/env.ts.
 */
export const configureGoogleAiEnvironment = (
  config: GoogleAiEnvironmentConfig,
  target: NodeJS.ProcessEnv = process.env,
): void => {
  if (config.apiKey) target.GOOGLE_API_KEY = config.apiKey;
  delete target.GEMINI_API_KEY;

  target.GOOGLE_GENAI_USE_ENTERPRISE = String(config.useEnterprise);
  delete target.GOOGLE_GENAI_USE_VERTEXAI;

  if (config.project) target.GOOGLE_CLOUD_PROJECT = config.project;
  if (config.location) target.GOOGLE_CLOUD_LOCATION = config.location;
};
