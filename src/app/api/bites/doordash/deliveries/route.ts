import { NextRequest, NextResponse } from "next/server";
import { createDoorDashDelivery } from "@/lib/doordashDrive.server";
import type { DDDropoff, DDPickup } from "@/lib/doordashDrive.server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      orderId?: string;
      pickup?: DDPickup;
      dropoff?: DDDropoff;
      orderValueUsd?: number;
      tipCents?: number;
    };
    const { orderId, pickup, dropoff, orderValueUsd, tipCents } = body;
    if (!orderId || !pickup || !dropoff || typeof orderValueUsd !== "number") {
      return NextResponse.json({ ok: false, error: "orderId, pickup, dropoff, orderValueUsd required" }, { status: 400 });
    }
    const result = await createDoorDashDelivery(orderId, pickup, dropoff, orderValueUsd, tipCents ?? 0);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DoorDash error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
