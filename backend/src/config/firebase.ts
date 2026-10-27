import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env.js";

const { projectId, clientEmail, privateKey } = env.firebase;

const credential =
  projectId && clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    credential,
    ...(projectId ? { projectId } : {}),
  });

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
