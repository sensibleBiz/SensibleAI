import type { CollectionReference, DocumentData, Firestore } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { OUTLET_SUBCOLLECTIONS, ROOT_COLLECTIONS, type ProfilerConfig } from "./config.js";

export interface CollectionInventory {
  references: Map<string, CollectionReference<DocumentData>[]>;
  discoveredCollections: Set<string>;
}

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function discoverCollections(firestore: Firestore, config: ProfilerConfig): Promise<CollectionInventory> {
  const references = new Map<string, CollectionReference<DocumentData>[]>();
  const discoveredCollections = new Set<string>();
  const visited = new Set<string>();
  const referencePaths = new Set<string>();
  const addReference = (collection: CollectionReference<DocumentData>) => {
    if (referencePaths.has(collection.path)) return;
    referencePaths.add(collection.path);
    const list = references.get(collection.id) ?? [];
    list.push(collection);
    references.set(collection.id, list);
  };
  for (const name of ROOT_COLLECTIONS) addReference(firestore.collection(name));
  const queue = await firestore.listCollections();
  while (queue.length) {
    const collection = queue.shift();
    if (!collection || visited.has(collection.path)) continue;
    visited.add(collection.path);
    discoveredCollections.add(collection.id);
    addReference(collection);
    let lastId: string | undefined;
    while (true) {
      let query = collection.select().orderBy(FieldPath.documentId()).limit(config.batchSize);
      if (lastId) query = query.startAfter(lastId);
      const snapshot = await query.get();
      const nestedCollections = await Promise.all(snapshot.docs.map((document) => document.ref.listCollections()));
      for (const [index, document] of snapshot.docs.entries()) {
        queue.push(...(nestedCollections[index] ?? []));
        if (collection.path === "OUTLET") {
          for (const name of OUTLET_SUBCOLLECTIONS) addReference(document.ref.collection(name));
        }
      }
      if (snapshot.size < config.batchSize) break;
      lastId = snapshot.docs.at(-1)?.id;
      await pause(config.pauseMs);
    }
  }
  return { references, discoveredCollections };
}
