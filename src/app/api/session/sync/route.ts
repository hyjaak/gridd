import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { hasRequiredAgreements } from "@/lib/db";
import type { UserRole } from "@/types";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCfk8V0zwPjMKZUkJBjoSCh39AKV9vp50c";
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "gridd-3edba";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function loadRole(uid: string): Promise<UserRole | null> {
  if (!adminDb) return null;
  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (userSnap.exists) return (userSnap.data()?.role as UserRole) ?? null;
  return null;
}

function agreementsComplete(role: UserRole, signed: string[]): boolean {
  const base = ["terms", "privacy", "zerotolerance"] as const;
  const required: string[] =
    role === "driver" ? [...base, "provider_agreement"] : [...base];
  return required.every((d) => signed.includes(d));
}

function parseUserDocFromRest(json: { fields?: Record<string, unknown> }): {
  role: UserRole | null;
  agreementsSigned: string[];
} {
  const fields = json.fields ?? {};
  const roleRaw = (fields.role as { stringValue?: string } | undefined)?.stringValue;
  const role: UserRole | null =
    roleRaw === "admin" || roleRaw === "driver" || roleRaw === "customer"
      ? roleRaw
      : null;
  const arr = fields.agreementsSigned as
    | { arrayValue?: { values?: Array<{ stringValue?: string }> } }
    | undefined;
  const agreementsSigned = (arr?.arrayValue?.values ?? [])
    .map((v) => v.stringValue)
    .filter((s): s is string => !!s);
  return { role, agreementsSigned };
}

/**
 * When Firebase Admin service account env vars are not set, verify the ID token
 * via Identity Toolkit and load the user profile via Firestore REST with the same token.
 */
async function syncWithoutAdmin(idToken: string): Promise<
  | { ok: true; uid: string; role: UserRole; agreementsOk: boolean }
  | { ok: false; error: string; status: number }
> {
  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  const lookupJson = (await lookupRes.json().catch(() => ({}))) as {
    users?: Array<{ localId?: string }>;
    error?: { message?: string };
  };
  const uid = lookupJson.users?.[0]?.localId;
  if (!uid) {
    return {
      ok: false,
      error: lookupJson.error?.message ?? "Invalid or expired token",
      status: 401,
    };
  }

  const docUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const docRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!docRes.ok) {
    return {
      ok: false,
      error: "Missing user profile — complete signup or contact support.",
      status: 400,
    };
  }
  const docJson = (await docRes.json()) as { fields?: Record<string, unknown> };
  const { role, agreementsSigned } = parseUserDocFromRest(docJson);
  if (!role) {
    return {
      ok: false,
      error: "Missing user profile — complete signup or contact support.",
      status: 400,
    };
  }
  const agreementsOk = agreementsComplete(role, agreementsSigned);
  return { ok: true, uid, role, agreementsOk };
}

function applySessionCookies(
  res: NextResponse,
  uid: string,
  role: UserRole,
  agreementsOk: boolean,
) {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("gridd_uid", uid, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  res.cookies.set("gridd_role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  res.cookies.set("gridd_agreements_ok", agreementsOk ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function POST(req: Request) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });
  }

  if (adminAuth && adminDb) {
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }
    const role = await loadRole(decoded.uid);
    if (!role) {
      return NextResponse.json(
        { ok: false, error: "Missing user profile — complete signup or contact support." },
        { status: 400 },
      );
    }
    const status = await hasRequiredAgreements(decoded.uid, role);
    const res = NextResponse.json({ ok: true, role, agreementsOk: status.ok });
    applySessionCookies(res, decoded.uid, role, status.ok);
    return res;
  }

  const fallback = await syncWithoutAdmin(token);
  if (!fallback.ok) {
    return NextResponse.json(
      { ok: false, error: fallback.error },
      { status: fallback.status },
    );
  }
  const res = NextResponse.json({
    ok: true,
    role: fallback.role,
    agreementsOk: fallback.agreementsOk,
  });
  applySessionCookies(res, fallback.uid, fallback.role, fallback.agreementsOk);
  return res;
}
