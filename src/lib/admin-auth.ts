import { adminAuth } from "@/lib/firebase-admin";
import { getUser } from "@/lib/db";

/** Bearer token must belong to a user with role admin. */
export async function requireAdminBearer(req: Request): Promise<string | null> {
  if (!adminAuth) return null;
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) return null;
  const user = await getUser(decoded.uid);
  if (user?.role !== "admin") return null;
  return decoded.uid;
}
