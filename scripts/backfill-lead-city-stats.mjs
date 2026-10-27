import { initializeApp } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  setDoc,
  doc,
} from "firebase/firestore";
import dayjs from "dayjs";

const firebaseConfig = {
  apiKey: "AIzaSyCZ-qNuzdfc2BtorkZQ-IUoh6OWJnuZ_vM",
  authDomain: "sensiblecrm.firebaseapp.com",
  projectId: "sensiblecrm",
  storageBucket: "sensiblecrm.firebasestorage.app",
  messagingSenderId: "700529442570",
  appId: "1:700529442570:web:286030337f189f5cefc4f3",
  measurementId: "G-BPB72J5Y2T",
};

const outletId = process.argv[2];

if (!outletId) {
  console.error("Usage: node scripts/backfill-lead-city-stats.mjs <outletId>");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const normalizeLocationPart = (value, fallback) =>
  (value || fallback).trim().toUpperCase() || fallback;

const toDocIdPart = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const getStageField = (stage) => {
  switch ((stage || "").trim().toUpperCase()) {
    case "ASSIGNED":
      return "assigned";
    case "FOLLOWUP":
      return "followup";
    case "WON":
      return "completed";
    case "LOST":
      return "lost";
    case "DISQUALIFIED":
      return "disqual";
    case "NEW":
    default:
      return "new";
  }
};

const leadsRef = collection(db, "OUTLET", outletId, "LEADS_MANAGEMENT");
const snapshot = await getDocs(leadsRef);
const stats = new Map();

snapshot.forEach((leadDoc) => {
  const lead = leadDoc.data();
  const created = dayjs(lead.createdDate || Date.now());
  const dateKey = created.format("YYYY-MM-DD");
  const state = normalizeLocationPart(lead.state, "UNKNOWN STATE");
  const city = normalizeLocationPart(lead.city, "UNKNOWN CITY");
  const key = `${dateKey}_${toDocIdPart(state)}_${toDocIdPart(city)}`;
  const stageField = getStageField(lead.stage);

  if (!stats.has(key)) {
    stats.set(key, {
      assigned: 0,
      city,
      completed: 0,
      dateKey,
      dayStart: created.startOf("day").valueOf(),
      disqual: 0,
      followup: 0,
      id: key,
      lost: 0,
      new: 0,
      state,
      total: 0,
    });
  }

  const row = stats.get(key);
  row.total += 1;
  row[stageField] += 1;
});

const writes = Array.from(stats.entries()).map(([id, data]) =>
  setDoc(doc(db, "OUTLET", outletId, "LEAD_DAILY_CITY_STATS", id), data)
);

await Promise.all(writes);

console.log(
  `Backfilled ${stats.size} city/day summary docs from ${snapshot.size} leads for outlet ${outletId}.`
);
