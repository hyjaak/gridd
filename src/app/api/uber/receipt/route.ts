import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { uberApi } from "@/lib/uberApi";
import { applyReceiptToJob } from "@/lib/uberServerSync";
import { getValidUserAccessToken } from "@/lib/uberUserSession";

export async function GET(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const requestId = new URL(req.url).searchParams.get("requestId")?.trim() ?? "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "requestId required" }, { status: 400 });
  }
  const token = await getValidUserAccessToken(decoded.uid);
  const receipt = await uberApi.getRideReceipt(token, requestId);
  await applyReceiptToJob(requestId, receipt);
  return NextResponse.json({ ok: true, receipt });
}
