import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

const CODE_RE = /^GRIDD-[A-Z0-9]+-\d{4}$/i;

export async function POST(req: Request) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const raw = (body.code ?? "").trim().toUpperCase();
  if (!CODE_RE.test(raw)) {
    return NextResponse.json({ ok: false, error: "Invalid code format" }, { status: 400 });
  }

  const meRef = adminDb.collection("users").doc(decoded.uid);
  const meSnap = await meRef.get();
  if (!meSnap.exists) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 400 });
  }
  const me = meSnap.data() as { referredByUid?: string };
  if (me.referredByUid) {
    return NextResponse.json({ ok: false, error: "Referral already applied" }, { status: 400 });
  }

  const uq = await adminDb.collection("users").where("referralCode", "==", raw).limit(2).get();
  const pq = uq.empty
    ? await adminDb.collection("providers").where("referralCode", "==", raw).limit(2).get()
    : null;
  const q = !uq.empty ? uq : pq;
  if (!q || q.empty) {
    return NextResponse.json({ ok: false, error: "Code not found" }, { status: 404 });
  }
  const referrerDoc = q.docs[0];
  if (referrerDoc.id === decoded.uid) {
    return NextResponse.json({ ok: false, error: "Cannot use your own code" }, { status: 400 });
  }

  const completedAt = new Date().toISOString();
  const batch = adminDb.batch();
  batch.set(
    meRef,
    { referredByUid: referrerDoc.id, appliedReferralCode: raw },
    { merge: true },
  );
  batch.set(adminDb.collection("referrals").doc(), {
    referrerId: referrerDoc.id,
    referredUserId: decoded.uid,
    code: raw,
    status: "pending" as const,
    rewardPaid: false,
    createdAt: completedAt,
  });
  await batch.commit();

  return NextResponse.json({ ok: true });
}
