import { NextResponse } from "next/server";
import { requireAdminBearer } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { saveNotificationAndPush } from "@/lib/notify-internal";

const MAX_SEND = 300;

export async function POST(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as {
    audience?: string;
    title?: string;
    body?: string;
    zip?: string;
  } | null;

  const title = body?.title?.trim();
  const text = body?.body?.trim();
  if (!title || !text) {
    return NextResponse.json({ ok: false, error: "Missing title or body" }, { status: 400 });
  }

  const audience = body?.audience ?? "all";
  const zip = body?.zip?.trim();

  const targets = new Set<string>();

  if (audience === "all") {
    const [us, ps] = await Promise.all([
      adminDb.collection("users").limit(800).get(),
      adminDb.collection("providers").limit(800).get(),
    ]);
    us.docs.forEach((d) => targets.add(d.id));
    ps.docs.forEach((d) => targets.add(d.id));
  } else if (audience === "customers") {
    const snap = await adminDb
      .collection("users")
      .where("role", "==", "customer")
      .limit(800)
      .get()
      .catch(() => null);
    if (snap && !snap.empty) {
      snap.docs.forEach((d) => targets.add(d.id));
    } else {
      const all = await adminDb.collection("users").limit(800).get();
      all.docs.forEach((d) => {
        const role = (d.data() as { role?: string }).role;
        if (role === "customer" || !role) targets.add(d.id);
      });
    }
  } else if (audience === "drivers") {
    const snap = await adminDb.collection("providers").limit(800).get();
    snap.docs.forEach((d) => targets.add(d.id));
  } else if (audience === "zip" && zip) {
    const [uZ, pZ] = await Promise.all([
      adminDb.collection("users").where("zip", "==", zip).limit(300).get().catch(() => null),
      adminDb.collection("providers").where("zip", "==", zip).limit(300).get().catch(() => null),
    ]);
    uZ?.docs.forEach((d) => targets.add(d.id));
    pZ?.docs.forEach((d) => targets.add(d.id));
  } else {
    return NextResponse.json({ ok: false, error: "Invalid audience" }, { status: 400 });
  }

  let sent = 0;
  for (const userId of targets) {
    if (sent >= MAX_SEND) break;
    await saveNotificationAndPush({
      userId,
      event: "admin_broadcast",
      title,
      body: text,
      icon: "📢",
      color: "#00FF88",
    });
    sent++;
  }

  return NextResponse.json({
    ok: true,
    sent,
    audience,
    capped: targets.size > MAX_SEND,
    totalTargets: targets.size,
  });
}
