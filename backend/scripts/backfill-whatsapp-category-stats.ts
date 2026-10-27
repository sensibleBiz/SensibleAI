import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import type { WhatsAppMessageLog } from "../../src/features/whatsapp/types/types";
import {
  getWhatsAppCategorizedChats,
  getWhatsAppCategoryStats,
  WHATSAPP_STATS_FIELD,
  WHATSAPP_STATS_VERSION,
  WHATSAPP_STATS_VERSION_FIELD,
} from "../../src/features/whatsapp/pages/whatsappCategories";

const PAGE_SIZE = 200;
const args = process.argv.slice(2);
const outletId = args.find((argument) => !argument.startsWith("--"));
const shouldWrite = args.includes("--write");

if (!outletId) {
  console.error(
    "Usage: npm --prefix backend run backfill:whatsapp-stats -- <outletId> [--write]"
  );
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || "sensiblecrm",
  });
}

const db = getFirestore();
const messagesRef = db
  .collection("OUTLET")
  .doc(outletId)
  .collection("WHATSAPP_MESSAGES");

let lastDocument: FirebaseFirestore.QueryDocumentSnapshot | undefined;
let processed = 0;

do {
  let pageQuery = messagesRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (lastDocument) pageQuery = pageQuery.startAfter(lastDocument);

  const snapshot = await pageQuery.get();
  if (snapshot.empty) break;

  const batch = db.batch();
  snapshot.docs.forEach((document) => {
    const chat = {
      id: document.id,
      ...document.data(),
    } as WhatsAppMessageLog;
    const categoryStats = getWhatsAppCategoryStats(
      getWhatsAppCategorizedChats([chat])
    );

    batch.update(document.ref, {
      [WHATSAPP_STATS_VERSION_FIELD]: WHATSAPP_STATS_VERSION,
      [WHATSAPP_STATS_FIELD]: categoryStats,
    });
  });

  if (shouldWrite) await batch.commit();

  processed += snapshot.size;
  lastDocument = snapshot.docs[snapshot.docs.length - 1];
  console.log(`${shouldWrite ? "Backfilled" : "Checked"} ${processed} conversations...`);
} while (lastDocument);

console.log(
  shouldWrite
    ? `Backfilled indexed WhatsApp counts for ${processed} conversations in outlet ${outletId}.`
    : `Dry run complete for ${processed} conversations. Add --write to save the index fields.`
);
