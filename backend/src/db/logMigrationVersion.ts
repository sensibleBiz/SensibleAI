import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface JournalEntry {
  idx: number;
  tag: string;
}

/**
 * Logs the code's expected migration version at startup.
 * Operators can cross-check this against the DB's drizzle.__drizzle_migrations
 * table to detect schema/code version skew after a deploy.
 */
export async function logMigrationVersion(): Promise<void> {
  try {
    const migrationsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../migrations",
    );
    const journal = JSON.parse(
      await readFile(path.join(migrationsDir, "meta", "_journal.json"), "utf8"),
    ) as { entries: JournalEntry[] };
    const latest = journal.entries.at(-1);
    console.log(JSON.stringify({
      severity: "INFO",
      event: "MIGRATION_VERSION",
      latestMigration: latest?.tag ?? "none",
      totalMigrations: journal.entries.length,
      message: "Code expects this migration version; verify DB matches via: SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    }));
  } catch (error) {
    console.warn(JSON.stringify({
      severity: "WARN",
      event: "MIGRATION_JOURNAL_READ_FAILED",
      reason: error instanceof Error ? error.message : String(error),
    }));
  }
}
