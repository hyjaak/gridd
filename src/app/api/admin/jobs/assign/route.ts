import { NextResponse } from "next/server";
import { requireAdminBearer } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { updateJob } from "@/lib/db";

export async function POST(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as {
    jobId?: string;
    providerUid?: string;
  } | null;

  const jobId = body?.jobId?.trim();
  const providerUid = body?.providerUid?.trim();
  if (!jobId || !providerUid) {
    return NextResponse.json({ ok: false, error: "Missing jobId or providerUid" }, { status: 400 });
  }

  const prov = await adminDb.collection("providers").doc(providerUid).get();
  const name =
    (prov.data() as { name?: string } | undefined)?.name ??
    prov.data()?.email?.split?.("@")?.[0] ??
    "Driver";

  await updateJob(jobId, {
    providerUid,
    providerId: providerUid,
    providerName: name,
    status: "active",
    acceptedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
