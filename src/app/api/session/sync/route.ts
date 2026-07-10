import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getUserRole, hasRequiredAgreements } from "@/lib/db";
import { logSecurityEvent } from "@/lib/security-log-server";
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
    roleRaw === "ceo" || roleRaw === "admin"
      ? "ceo"
      : roleRaw === "driver" || roleRaw === "customer"
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

  const usersUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const usersRes = await fetch(usersUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  let docJson: { fields?: Record<string, unknown> };
  let role: UserRole | null;
  let agreementsSigned: string[];

  if (usersRes.ok) {
    docJson = (await usersRes.json()) as { fields?: Record<string, unknown> };
    const parsed = parseUserDocFromRest(docJson);
    role = parsed.role;
    agreementsSigned = parsed.agreementsSigned;
  } else {
    const provUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/providers/${uid}`;
    const provRes = await fetch(provUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!provRes.ok) {
      return {
        ok: false,
        error: "Missing profile — complete signup or contact support.",
        status: 400,
      };
    }
    docJson = (await provRes.json()) as { fields?: Record<string, unknown> };
    const parsed = parseUserDocFromRest(docJson);
    role = parsed.role ?? "driver";
    agreementsSigned = parsed.agreementsSigned;
  }

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

/** www vs apex (or preview URL) → browser sends OPTIONS preflight; without this, Next returns 405. */
function isAllowedCorsOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h === "gridd.click" || h === "www.gridd.click") return true;
    if (h.endsWith(".vercel.app")) return true;
    const canonical = process.env.NEXT_PUBLIC_APP_URL;
    if (canonical) {
      const ch = new URL(canonical).hostname;
      if (h === ch || h === `www.${ch}`) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function withCors(req: Request, res: NextResponse): NextResponse {
  const origin = req.headers.get("origin");
  if (origin && isAllowedCorsOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const h = new Headers();
  if (origin && isAllowedCorsOrigin(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Credentials", "true");
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return new NextResponse(null, { status: 204, headers: h });
}

/** Uptime probes / accidental GET — avoid 405 noise in Vercel logs. */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      hint: "Use POST with Authorization: Bearer <Firebase ID token>.",
    },
    { status: 200 },
  );
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
    return withCors(req, NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 }));
  }

  const clientIp =
    (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ||
    "unknown";
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 512);

  if (adminAuth && adminDb) {
    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return withCors(req, NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 }));
    }
    const role = await getUserRole(decoded.uid);
    if (!role) {
      return withCors(
        req,
        NextResponse.json(
          { ok: false, error: "Missing user profile — complete signup or contact support." },
          { status: 400 },
        ),
      );
    }
    const status = await hasRequiredAgreements(decoded.uid, role);
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    const email = snap.exists ? (snap.data() as { email?: string }).email : undefined;
    void logSecurityEvent({
      uid: decoded.uid,
      email: email ?? undefined,
      kind: "session_sync",
      ip: clientIp,
      userAgent,
    });
    const res = NextResponse.json({ ok: true, role, agreementsOk: status.ok });
    applySessionCookies(res, decoded.uid, role, status.ok);
    return withCors(req, res);
  }

  const fallback = await syncWithoutAdmin(token);
  if (!fallback.ok) {
    return withCors(
      req,
      NextResponse.json({ ok: false, error: fallback.error }, { status: fallback.status }),
    );
  }
  const res = NextResponse.json({
    ok: true,
    role: fallback.role,
    agreementsOk: fallback.agreementsOk,
  });
  applySessionCookies(res, fallback.uid, fallback.role, fallback.agreementsOk);
  return withCors(req, res);
}
