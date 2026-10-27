import dotenv from "dotenv";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertSafeConfiguration, loadProfilerConfig, safetySummary } from "./config.js";
import { profileFirestore } from "./profiler.js";
import { writeReports } from "./report-writer.js";

dotenv.config({ path: ".env.local-private" });
dotenv.config();

async function main(): Promise<void> {
  const config = loadProfilerConfig();
  assertSafeConfiguration(config);
  process.stdout.write(`${safetySummary(config)}\n`);
  const clientEmail = process.env.PROFILE_FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.PROFILE_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (Boolean(clientEmail) !== Boolean(privateKey)) throw new Error("Dedicated profile credentials must provide both PROFILE_FIREBASE_CLIENT_EMAIL and PROFILE_FIREBASE_PRIVATE_KEY");
  const credential = clientEmail && privateKey ? cert({ projectId: config.projectId, clientEmail, privateKey }) : applicationDefault();
  const app = initializeApp({ projectId: config.projectId, credential }, `firestore-profiler-${Date.now()}`);
  const report = await profileFirestore(getFirestore(app), config);
  const locations = await writeReports(report, config.outputDirectory);
  process.stdout.write(`Profile complete: ${report.totalRecordsAnalyzed} records, ${report.collections.length} collections\n`);
  process.stdout.write(`Reports: ${locations.json}, ${locations.summary}, ${locations.findings}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown profiler failure";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

