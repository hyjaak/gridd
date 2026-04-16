import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getJob } from "@/lib/db";
import { saveNotificationAndPush } from "@/lib/notify-internal";

function bearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function providerId(job: { providerUid?: string; providerId?: string }) {
  return job.providerUid ?? job.providerId;
}

/** Driver updates customer notification after a status change (authorized: assigned driver only). */
export async function POST(
  req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!adminAuth) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const { jobId } = await context.params;
  const token = bearerToken(req);
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

  const pid = providerId(job);
  if (!pid || pid !== decoded.uid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { kind?: string } | null;
  const kind = body?.kind ?? "update";

  const title =
    kind === "accepted"
      ? "Driver accepted"
      : kind === "arrived"
        ? "Driver arrived"
        : kind === "started"
          ? "Job started"
          : kind === "en_route"
            ? "Driver on the way"
            : "Job update";

  const bodyText =
    kind === "accepted"
      ? `A driver accepted your ${job.serviceName} request.`
      : kind === "arrived"
        ? `Your provider has arrived for ${job.serviceName}.`
        : kind === "started"
          ? `${job.serviceName} is now in progress.`
          : kind === "en_route"
            ? `Your driver is heading to you for ${job.serviceName}.`
            : `Update on ${job.serviceName}.`;

  await saveNotificationAndPush({
    userId: job.customerUid,
    event: "driver_status",
    title,
    body: bodyText,
    icon: "🚗",
    color: "#00FF88",
  });

  return NextResponse.json({ ok: true });
}
