import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { saveNotificationAndPush } from "@/lib/notify-internal";

/** Push + in-app notification when someone sends a DM (caller must be the sender). */
export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    recipientUid?: string;
    senderName?: string;
    preview?: string;
    conversationId?: string;
  } | null;

  const recipientUid = body?.recipientUid?.trim();
  const senderName = (body?.senderName ?? "Someone").slice(0, 80);
  const preview = (body?.preview ?? "New message").slice(0, 180);
  const conversationId = body?.conversationId?.trim() ?? "";

  if (!recipientUid) {
    return NextResponse.json({ ok: false, error: "Invalid recipient" }, { status: 400 });
  }
  if (recipientUid === decoded.uid) {
    return NextResponse.json({ ok: false, error: "Invalid recipient" }, { status: 400 });
  }

  await saveNotificationAndPush({
    userId: recipientUid,
    event: "dm_message",
    title: senderName,
    body: preview,
    icon: "💬",
    color: "#ff6b00",
  });

  return NextResponse.json({ ok: true, conversationId });
}
