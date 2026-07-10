import { NextRequest, NextResponse } from "next/server";
import { getDoorDashDeliveryByExternalId } from "@/lib/doordashDrive.server";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ externalId: string }> },
) {
  try {
    const { externalId } = await ctx.params;
    if (!externalId) {
      return NextResponse.json({ ok: false, error: "externalId required" }, { status: 400 });
    }
    const result = await getDoorDashDeliveryByExternalId(externalId);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DoorDash error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
