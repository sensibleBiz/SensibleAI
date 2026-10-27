import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost/sensible_crm",
  },
  strict: true,
  verbose: true,
});
