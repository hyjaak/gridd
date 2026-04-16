import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getJob } from "@/lib/db";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Returns a dial URL for the GRIDD voice bridge (real number in env).
 * Keeps driver personal numbers off-device until connected.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!adminAuth) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const { jobId } = await context.params;
  const token = bearerToken(_req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const uid = decoded.uid;
  if (job.customerUid !== uid && job.providerUid !== uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const e164 =
    process.env.GRIDD_CALL_BRIDGE_E164?.trim() ||
    process.env.NEXT_PUBLIC_GRIDD_CALL_BRIDGE_E164?.trim() ||
    "";

  if (!e164) {
    return NextResponse.json(
      {
        ok: false,
        error: "Call bridge not configured",
        hint: "Set GRIDD_CALL_BRIDGE_E164 in server env.",
      },
      { status: 503 },
    );
  }

  const tel = e164.startsWith("tel:") ? e164 : `tel:${e164}`;
  return NextResponse.json({ ok: true, dialUrl: tel, jobId });
}
