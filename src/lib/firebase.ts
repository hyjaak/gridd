import { initializeApp, getApps, getApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Optional NEXT_PUBLIC_* overrides — storage bucket must match Firebase Console → Storage exactly.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCfk8V0zwPjMKZUkJBjoSCh39AKV9vp50c",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "gridd-3edba.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "gridd-3edba",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "gridd-3edba.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "174687912980",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:174687912980:web:0e0b4bdab61ff2762ed301",
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
