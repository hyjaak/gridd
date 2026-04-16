import { NextResponse } from "next/server";
import { getUser } from "@/lib/db";
import { saveNotificationAndPush, verifyBearerUid } from "@/lib/notify-internal";

export type NotifyBody = {
  userId: string;
  event: string;
  title: string;
  body: string;
  icon?: string;
  color?: string;
};

export async function POST(req: Request) {
  const internal = process.env.NOTIFY_INTERNAL_SECRET;
  const headerSecret = req.headers.get("x-internal-secret");
  const isInternal = internal && headerSecret === internal;

  const body = (await req.json().catch(() => null)) as NotifyBody | null;
  if (!body?.userId || !body.event || !body.title || !body.body) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (!isInternal) {
    const uid = await verifyBearerUid(req);
    if (!uid) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const actor = await getUser(uid);
    const isAdmin = actor?.role === "admin";
    const isSelf = uid === body.userId;
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  const criticalSms = new Set([
    "driver_accepted",
    "driver_arriving",
    "payout_sent",
    "new_job",
  ]);
  if (criticalSms.has(body.event)) {
    // SMS path is handled inside saveNotificationAndPush for these events when phone exists
  }

  const { id } = await saveNotificationAndPush({
    userId: body.userId,
    event: body.event,
    title: body.title,
    body: body.body,
    icon: body.icon,
    color: body.color,
  });

  return NextResponse.json({ ok: true, id });
}
