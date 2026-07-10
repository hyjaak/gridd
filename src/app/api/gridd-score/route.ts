import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { applyGriddScoreDelta, recordGriddScoreLedgerOnce } from "@/lib/gridd-score-server";
import { getUserRole } from "@/lib/db";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

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
  const body = (await req.json().catch(() => ({}))) as { action?: string; postId?: string };
  const action = body.action;
  const uid = decoded.uid;
  const role = await getUserRole(uid);

  if (action === "porch_post" && body.postId && typeof body.postId === "string") {
    const postSnap = await adminDb.collection("porch").doc(body.postId).get();
    if (!postSnap.exists) {
      return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
    }
    const d = postSnap.data() as { authorUid?: string };
    if (d.authorUid !== uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const ledgerId = `${uid}_porch_${body.postId}`;
    const fresh = await recordGriddScoreLedgerOnce(ledgerId);
    if (!fresh) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const coll = role === "driver" ? "providers" : "users";
    await applyGriddScoreDelta({ uid, collection: coll, delta: 5, reason: "porch_post" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
