import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function isCeoAdminUid(uid: string): Promise<boolean> {
  if (!adminDb) return false;
  const snap = await adminDb.collection("admins").doc(uid).get();
  if (!snap.exists) return false;
  const d = snap.data() as { approved?: boolean; role?: string; isCEO?: boolean };
  if (d?.approved === false) return false;
  return d?.role === "ceo" || d?.isCEO === true;
}

/** Strict vault + optional env override. Defaults to the documented CEO inbox. */
export async function canAccessBintaVault(uid: string): Promise<boolean> {
  if (!(await isCeoAdminUid(uid))) return false;
  if (!adminAuth) return false;
  const u = await adminAuth.getUser(uid).catch(() => null);
  if (!u?.email) return false;
  const allowed = (process.env.CEO_BINTA_VAULT_EMAIL ?? "jittaraw@gmail.com").toLowerCase();
  return u.email.toLowerCase() === allowed;
}

export function requestIpAddress(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
