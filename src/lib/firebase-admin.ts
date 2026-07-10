import admin from "firebase-admin";

/** Prefer short names; support `FIREBASE_ADMIN_*` (common in Vercel / service-account JSON keys). */
function adminEnv() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ?? process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw =
    process.env.FIREBASE_PRIVATE_KEY ?? process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return { projectId, clientEmail, privateKeyRaw };
}

function canInit() {
  const { projectId, clientEmail, privateKeyRaw } = adminEnv();
  if (!projectId || !clientEmail || !privateKeyRaw) return false;
  if (privateKeyRaw.includes("PASTE_FULL_KEY_HERE")) return false;
  return true;
}

if (!admin.apps.length && canInit()) {
  const { projectId, clientEmail, privateKeyRaw } = adminEnv();
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: projectId!,
      clientEmail: clientEmail!,
      privateKey: privateKeyRaw!.replace(/\\n/g, "\n"),
    }),
  });
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminDb = admin.apps.length ? admin.firestore() : null;
export default admin;

