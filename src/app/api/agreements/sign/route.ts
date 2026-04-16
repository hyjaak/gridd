import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  hasRequiredAgreements,
  requiredDocsForRole,
  signAgreement,
  type LegalDocId,
} from "@/lib/db";
import type { UserRole } from "@/types";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function getRole(uid: string): Promise<UserRole | null> {
  if (!adminDb) return null;
  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (userSnap.exists) return (userSnap.data()?.role as UserRole) ?? null;
  return null;
}

export async function POST(req: Request) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const token = bearerToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

  const { docId } = (await req.json().catch(() => ({}))) as { docId?: LegalDocId };
  if (!docId) return NextResponse.json({ ok: false, error: "Missing docId" }, { status: 400 });

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });

  const role = await getRole(decoded.uid);
  if (!role) return NextResponse.json({ ok: false, error: "Missing role" }, { status: 400 });

  const required = requiredDocsForRole(role);
  if (!required.includes(docId) && !["community", "payments", "safety"].includes(docId)) {
    return NextResponse.json({ ok: false, error: "Unknown doc" }, { status: 400 });
  }

  // Required docs are stored in Firestore to enforce gating.
  if (required.includes(docId)) {
    await signAgreement(decoded.uid, role, docId);
  }

  const status = await hasRequiredAgreements(decoded.uid, role);
  return NextResponse.json({ ...status, role });
}

