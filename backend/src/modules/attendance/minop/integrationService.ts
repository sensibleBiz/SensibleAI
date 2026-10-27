import { firestore } from "../../../config/firebase.js";
import { normalizeText } from "./validation.js";

export interface MinopIntegration {
  id: string;
  outletId: string;
  postgresOutletId?: string;
  integrationKey?: string;
  timezone?: string;
  [key: string]: unknown;
}

const findActiveIntegrationDoc = (
  snapshot: FirebaseFirestore.QuerySnapshot,
  integrationKey: string,
): MinopIntegration | null => {
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    if (integrationKey && normalizeText(data.integrationKey) !== integrationKey) continue;
    if (data.isActive !== true || data.type !== "MINOP") continue;
    if (!data.outletId) continue;
    return { id: doc.id, ...data, outletId: String(data.outletId) };
  }
  return null;
};

export const findActiveIntegration = async (integrationKey: string) => {
  const key = normalizeText(integrationKey);
  if (!key) return null;
  const snapshot = await firestore
    .collection("INTEGRATION")
    .where("integrationKey", "==", key)
    .where("isActive", "==", true)
    .where("type", "==", "MINOP")
    .limit(5)
    .get();
  return findActiveIntegrationDoc(snapshot, key);
};

export const findActiveIntegrationCached = async (
  integrationKey: string,
  cache: Map<string, MinopIntegration | null>,
) => {
  const key = normalizeText(integrationKey);
  if (cache.has(key)) return cache.get(key) ?? null;
  const integration = await findActiveIntegration(key);
  cache.set(key, integration);
  return integration;
};

export const getOutletCached = async (outletId: string, cache: Map<string, FirebaseFirestore.DocumentSnapshot>) => {
  const key = normalizeText(outletId);
  if (cache.has(key)) return cache.get(key)!;
  const outletDoc = await firestore.collection("OUTLET").doc(key).get();
  cache.set(key, outletDoc);
  return outletDoc;
};

export const resolvePostgresOutletId = (integration: MinopIntegration) => {
  const candidate = normalizeText(integration.postgresOutletId) || normalizeText(integration.outletId);
  return candidate;
};
