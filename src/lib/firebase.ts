import { initializeApp, getApps, getApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Hardcoded config — works immediately (optional: override with NEXT_PUBLIC_* in .env.local)
const firebaseConfig = {
  apiKey: "AIzaSyCfk8V0zwPjMKZUkJBjoSCh39AKV9vp50c",
  authDomain: "gridd-3edba.firebaseapp.com",
  projectId: "gridd-3edba",
  storageBucket: "gridd-3edba.firebasestorage.app",
  messagingSenderId: "174687912980",
  appId: "1:174687912980:web:0e0b4bdab61ff2762ed301",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;

if (typeof window !== "undefined") {
  void setPersistence(auth, browserLocalPersistence).catch(() => null);
}

/** Back-compat for existing imports */
export const firebaseApp = app;
export const firebaseAuth = auth;
export const firebaseStorage = storage;
export const firestore = db;
