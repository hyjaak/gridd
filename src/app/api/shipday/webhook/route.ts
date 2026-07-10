import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/db";

export const runtime = "nodejs";

/** Uptime probes — avoid 405 noise. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      detail:
        "Shipday sends POST webhooks with JSON body. Configure this URL in Shipday; optional header `token` must match SHIPDAY_WEBHOOK_TOKEN when set.",
    },
    { status: 200 },
  );
}

/**
 * Shipday order status webhooks.
 * @see https://docs.shipday.com/reference/order-status-update-2
 */
export async function POST(req: Request) {
  const secret = process.env.SHIPDAY_WEBHOOK_TOKEN?.trim();
  if (secret) {
    const token = req.headers.get("token") ?? req.headers.get("Token");
    if (token !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const raw = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const order = payload.order as Record<string, unknown> | undefined;
  const orderNumber =
    (typeof order?.order_number === "string" && order.order_number) ||
    (typeof order?.orderNumber === "string" && order.orderNumber) ||
    "";
  if (!orderNumber) {
    return NextResponse.json({ received: true, note: "no order number" });
  }

  const job = await getJob(orderNumber);
  if (!job) {
    return NextResponse.json({ received: true, note: "unknown job" });
  }

  const event = typeof payload.event === "string" ? payload.event : "";
  const orderStatus = typeof payload.order_status === "string" ? payload.order_status : "";

  await updateJob(orderNumber, {
    shipdayLastEvent: event || undefined,
    shipdayOrderStatus: orderStatus || undefined,
    shipdayWebhookAt: new Date().toISOString(),
  });

  return NextResponse.json({ received: true });
}
