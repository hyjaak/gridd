import { NextRequest, NextResponse } from "next/server";
import { cancelDoorDashDelivery } from "@/lib/doordashDrive.server";

export async function PUT(
  _req: NextRequest,
  ctx: { params: Promise<{ externalId: string }> },
) {
  try {
    const { externalId } = await ctx.params;
    if (!externalId) {
      return NextResponse.json({ ok: false, error: "externalId required" }, { status: 400 });
    }
    await cancelDoorDashDelivery(externalId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DoorDash error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
