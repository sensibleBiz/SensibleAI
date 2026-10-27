import { FieldPath } from "firebase-admin/firestore";
import { Pool } from "pg";
import { firestore } from "../src/config/firebase.js";
import { env } from "../src/config/env.js";

const PAGE_SIZE = 200;
const sourceOutletId = process.argv.slice(2).find((value) => !value.startsWith("--"));
const shouldWrite = process.argv.includes("--write");
if (!sourceOutletId) throw new Error("Usage: npm run migrate:whatsapp -- <firestoreOutletId> [--write]");
const connectionString = env.database.adminUrl;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required");

const timestamp = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string") { const parsed = Date.parse(value); if (Number.isFinite(parsed)) return new Date(parsed); }
  return new Date(fallback);
};

const pool = new Pool({ connectionString, max: 1, application_name: "sensible-crm-whatsapp-migrator" });
try {
  const outletResult = await pool.query<{ id: string; tenant_id: string }>(
    "SELECT id,tenant_id FROM tenancy.outlets WHERE id::text=$1 OR legacy_id=$1 LIMIT 1",
    [sourceOutletId],
  );
  const outlet = outletResult.rows[0];
  if (!outlet) throw new Error(`No PostgreSQL outlet matches ${sourceOutletId}`);

  const source = firestore.collection("OUTLET").doc(sourceOutletId).collection("WHATSAPP_MESSAGES");
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let processed = 0;
  do {
    let query = source.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const document of snapshot.docs) {
      const data = document.data() as Record<string, unknown>;
      const mobile = String(data.mobile || data.phone || document.id).replace(/\D/g, "");
      if (!mobile) continue;
      const sentMessages = Array.isArray(data.sentMsgList) ? data.sentMsgList : [];
      const replyMessages = Array.isArray(data.replyMsgList) ? data.replyMsgList : [];
      const createdAt = timestamp(data.createdDateTimeMili ?? data.createdDateTime, Date.now());
      const updatedAt = timestamp(data.updatedDateTimeMili ?? data.updatedDateTime, createdAt.getTime());
      const lastReadAt = data.lastReadAtMili || data.lastReadAt ? timestamp(data.lastReadAtMili ?? data.lastReadAt, updatedAt.getTime()) : null;
      const { sentMsgList: _sent, replyMsgList: _replies, ...metadata } = data;
      if (shouldWrite) {
        await pool.query(`INSERT INTO crm.whatsapp_conversations
          (tenant_id,outlet_id,legacy_id,mobile,integrated_number,is_read,unread_count,last_read_at,sent_messages,reply_messages,metadata,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
          ON CONFLICT (tenant_id,outlet_id,mobile) DO UPDATE SET
            legacy_id=EXCLUDED.legacy_id,integrated_number=EXCLUDED.integrated_number,is_read=EXCLUDED.is_read,
            unread_count=EXCLUDED.unread_count,last_read_at=EXCLUDED.last_read_at,sent_messages=EXCLUDED.sent_messages,
            reply_messages=EXCLUDED.reply_messages,metadata=EXCLUDED.metadata,
            created_at=LEAST(crm.whatsapp_conversations.created_at,EXCLUDED.created_at),updated_at=EXCLUDED.updated_at`,
          [outlet.tenant_id,outlet.id,document.id,mobile,String(data.integrated_number || ""),data.isRead !== false,Number(data.unreadCount || 0),lastReadAt,JSON.stringify(sentMessages),JSON.stringify(replyMessages),JSON.stringify(metadata),createdAt,updatedAt]);
      }
      processed += 1;
    }
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < PAGE_SIZE) break;
  } while (cursor);
  console.log(`${shouldWrite ? "Migrated" : "Would migrate"} ${processed} WhatsApp conversations for outlet ${sourceOutletId}`);
} finally {
  await pool.end();
}
