import { app } from "./app.js";
import { env } from "./config/env.js";
import { closeApplicationPool } from "./db/client.js";
import { logMigrationVersion } from "./db/logMigrationVersion.js";

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(`Sensible CRM API listening on http://127.0.0.1:${env.port} and http://localhost:${env.port}`);
  void logMigrationVersion();
});

const shutdown = (signal: string) => {
  console.log(`[${new Date().toISOString()}] SERVER_SHUTDOWN_SIGNAL ${signal}`);

  // Cloud Run gives 10 seconds between SIGTERM and SIGKILL by default.
  // Force-exit at 9 s so the process exits cleanly instead of being killed.
  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 9_000);
  forceExit.unref();

  server.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server", error);
      process.exitCode = 1;
    }
    console.log(`[${new Date().toISOString()}] POOL_CLOSE_START`);
    void closeApplicationPool().then(() => {
      console.log(`[${new Date().toISOString()}] POOL_CLOSE_COMPLETE`);
    }).catch((poolError) => {
      console.error("Failed to close PostgreSQL pool", poolError);
      process.exitCode = 1;
    });
  });

  // Close idle keep-alive HTTP connections immediately so server.close() callback
  // fires as soon as in-flight requests finish, not when clients time out.
  server.closeIdleConnections();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
