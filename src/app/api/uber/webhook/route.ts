import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { uberApi } from "@/lib/uberApi";
import { getUberTokensForUser, updateJobFromUberDetail, applyReceiptToJob, setJobCancelledByUber } from "@/lib/uberServerSync";
import type { UberReceipt } from "@/lib/uberTypes";

type UberWebhook = {
  event_type?: string;
  resource_id?: string;
  meta?: { user_id?: string; resource_id?: string };
} & Record<string, unknown>;

function verifySig(raw: string, sigHeader: string | null, secret: string): boolean {
  if (!secret) return true;
  if (!sigHeader) return false;
  const mac = createHmac("sha256", secret).update(raw).digest("hex");
  const expected = `sha256=${mac}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(sigHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.UBER_WEBHOOK_SECRET?.trim() ?? "";
  const sig = req.headers.get("x-uber-signature");
  if (secret && !verifySig(raw, sig, secret)) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  }

  const payload = (() => {
    try {
      return JSON.parse(raw) as UberWebhook;
    } catch {
      return null;
    }
  })();
  if (!payload) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const type = String(payload.event_type ?? "");
  const requestId = String(
    (payload as { resource_href?: string }).resource_href?.split("/").pop() ||
      payload.resource_id ||
      payload.meta?.resource_id ||
      "",
  );

  if (!requestId) {
    return NextResponse.json({ ok: true, received: true, noop: "no request id" });
  }

  if (type.includes("cancelled")) {
    await setJobCancelledByUber(requestId);
    return NextResponse.json({ ok: true, received: true });
  }

  const uids = await findUidsByRequestId(requestId);

  if (type.includes("completed")) {
    for (const uid of uids) {
      const t = (await getUberTokensForUser(uid))?.accessToken;
      if (!t) continue;
      const rec = (await uberApi.getRideReceipt(t, requestId).catch(() => null)) as UberReceipt | null;
      if (rec) await applyReceiptToJob(requestId, rec);
    }
  } else {
    for (const uid of uids) {
      const t = (await getUberTokensForUser(uid))?.accessToken;
      if (!t) continue;
      const d = await uberApi.getRideStatus(t, requestId).catch(() => null);
      if (d) await updateJobFromUberDetail(requestId, d);
    }
  }

  return NextResponse.json({ ok: true, received: true });
}

async function findUidsByRequestId(requestId: string): Promise<string[]> {
  if (!adminDb) return [];
  const q = await adminDb
    .collection("jobs")
    .where("uberRequestId", "==", requestId)
    .limit(5)
    .get();
  return q.docs.map((d) => (d.data() as { customerUid?: string }).customerUid).filter((x): x is string => Boolean(x));
}
