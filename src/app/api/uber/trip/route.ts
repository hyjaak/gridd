import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { uberApi } from "@/lib/uberApi";
import { setJobCancelledByUber, updateJobFromUberDetail } from "@/lib/uberServerSync";
import { getValidUserAccessToken } from "@/lib/uberUserSession";

/** GET: live trip; ?cancelPreview=1: cancellation cost preview. DELETE: cancel trip. */
export async function GET(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId")?.trim() ?? "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "requestId required" }, { status: 400 });
  }
  const token = await getValidUserAccessToken(decoded.uid);
  if (url.searchParams.get("cancelPreview") === "1") {
    const c = await uberApi.getCancelCost(token, requestId);
    return NextResponse.json({ ok: true, cancel: c });
  }
  const detail = await uberApi.getRideStatus(token, requestId);
  await updateJobFromUberDetail(requestId, detail);
  return NextResponse.json({ ok: true, trip: detail });
}

export async function DELETE(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId")?.trim() ?? "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "requestId required" }, { status: 400 });
  }
  const token = await getValidUserAccessToken(decoded.uid);
  await uberApi.cancelRide(token, requestId);
  await setJobCancelledByUber(requestId);
  return NextResponse.json({ ok: true });
}
