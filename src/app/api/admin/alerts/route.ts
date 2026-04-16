import { NextResponse } from "next/server";
import { requireAdminBearer } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

export type AlertDoc = {
  id: string;
  severity?: "critical" | "warning" | "info";
  title?: string;
  body?: string;
  uid?: string;
  createdAt?: string;
};

export async function GET(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (!adminDb) {
    return NextResponse.json({ ok: true, items: [] });
  }

  let snap = await adminDb
    .collection("alerts")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get()
    .catch(() => null);

  if (!snap) {
    snap = await adminDb.collection("alerts").limit(50).get().catch(() => null);
  }

  if (!snap) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const items: AlertDoc[] = snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AlertDoc, "id">),
    }))
    .sort((a, b) => {
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return tb - ta;
    });

  return NextResponse.json({ ok: true, items });
}
