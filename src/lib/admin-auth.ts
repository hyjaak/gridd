import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getUser } from "@/lib/db";

type AdminDoc = {
  role?: string;
  isCEO?: boolean;
  /** When false, CEO access is revoked */
  approved?: boolean;
  email?: string;
};

/** True if Firestore `admins/{uid}` grants CEO / owner-level access. */
export function isCeoAdminDoc(data: AdminDoc | undefined): boolean {
  if (!data) return false;
  if (data.approved === false) return false;
  return data.role === "ceo" || data.isCEO === true;
}

/**
 * Verifies Authorization Bearer JWT.
 * Returns null if missing/invalid token or Admin Auth not configured.
 */
export async function verifyBearerDecoded(req: Request): Promise<DecodedIdToken | null> {
  if (!adminAuth) return null;
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  return adminAuth.verifyIdToken(token).catch(() => null);
}

/**
 * Resolve CEO access from `admins`:
 * 1) Document `admins/{tokenUid}` (canonical)
 * 2) First doc where `email` equals the ID token email (fixes wrong manual doc ID)
 *
 * Exact Firestore reads:
 * - get admins/{uid}
 * - query admins where email == <token email> (limit 1)
 */
async function resolveCeoUidFromAdmins(decoded: DecodedIdToken): Promise<string | null> {
  if (!adminDb) return null;
  const uid = decoded.uid;

  const byUid = await adminDb.collection("admins").doc(uid).get();
  const d0 = byUid.exists ? (byUid.data() as AdminDoc) : undefined;
  if (isCeoAdminDoc(d0)) return uid;

  const rawEmail = (decoded.email ?? "").trim();
  if (!rawEmail) return null;

  const tryEmails = Array.from(new Set([rawEmail, rawEmail.toLowerCase()]));
  for (const em of tryEmails) {
    const qs = await adminDb.collection("admins").where("email", "==", em).limit(1).get();
    if (qs.empty) continue;
    const d = qs.docs[0].data() as AdminDoc;
    const docEmail = (d.email ?? "").trim().toLowerCase();
    const tokenEmail = rawEmail.toLowerCase();
    if (docEmail !== tokenEmail) continue;
    if (isCeoAdminDoc(d)) return uid;
  }

  return null;
}

/**
 * Server-side: `users/{uid}.role === "ceo"` (legacy `"admin"` still accepted) OR CEO allowlist in `admins`
 * (by uid doc or email query — same as requireCeoBearer).
 */
export async function requireAdminBearer(req: Request): Promise<string | null> {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) return null;
  if (!adminDb) return null;

  const user = await getUser(decoded.uid);
  const ur = user?.role as string | undefined;
  if (ur === "ceo" || ur === "admin") return decoded.uid;

  const ceo = await resolveCeoUidFromAdmins(decoded);
  if (ceo) return ceo;

  return null;
}

/**
 * CEO-only actions (approve drivers, demo, etc.).
 * Must match dashboard access: `users.role` is `ceo` or legacy `admin`, OR CEO allowlist in `admins`
 * (same rules as `requireAdminBearer`). Do not restrict to `admins` only — that caused 403 when
 * access was granted via `users` doc without a matching `admins/{uid}` row.
 */
export async function requireCeoBearer(req: Request): Promise<string | null> {
  return requireAdminBearer(req);
}

export function clientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    undefined
  );
}
