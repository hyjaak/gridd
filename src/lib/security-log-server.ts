import admin, { adminDb } from "@/lib/firebase-admin";

export async function logSecurityEvent(input: {
  uid: string;
  email?: string;
  kind: "login_success" | "session_sync";
  ip: string;
  userAgent: string;
}): Promise<void> {
  if (!adminDb) return;
  await adminDb.collection("securityLogs").add({
    uid: input.uid,
    email: input.email ?? "",
    kind: input.kind,
    ip: input.ip.slice(0, 128),
    userAgent: input.userAgent.slice(0, 512),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
