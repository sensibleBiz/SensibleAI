
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCZ-qNuzdfc2BtorkZQ-IUoh6OWJnuZ_vM",
  authDomain: "sensiblecrm.firebaseapp.com",
  projectId: "sensiblecrm",
  storageBucket: "sensiblecrm.firebasestorage.app",
  messagingSenderId: "700529442570",
  appId: "1:700529442570:web:286030337f189f5cefc4f3",
  measurementId: "G-BPB72J5Y2T"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
