import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

interface JournalEntry {
  idx: number;
  tag: string;
}

interface MigrationJournal {
  entries: JournalEntry[];
}

test("every executable SQL migration is represented once and in order in the journal", async () => {
  const migrationsDirectory = path.resolve(process.cwd(), "migrations");
  const journal = JSON.parse(
    await readFile(path.join(migrationsDirectory, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
  // Rollback files (<prefix>_rollback.sql) are not journal entries — exclude them.
  const sqlFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql") && !file.endsWith("_rollback.sql"))
    .sort();
  const journalFiles = journal.entries.map((entry) => `${entry.tag}.sql`).sort();

  assert.deepEqual(journalFiles, sqlFiles);
  assert.deepEqual(journal.entries.map((entry) => entry.idx), journal.entries.map((_, index) => index));
  assert.equal(new Set(journal.entries.map((entry) => entry.tag)).size, journal.entries.length);
});
