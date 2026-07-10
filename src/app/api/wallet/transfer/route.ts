import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { getUser, transferWalletBetweenUsers } from "@/lib/db";

const MIN_CENTS = 100;
const MAX_CENTS = 500_000;

export async function POST(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { toUid?: string; amountCents?: number } | null;
  const toUid = typeof body?.toUid === "string" ? body.toUid : "";
  const amountCents = typeof body?.amountCents === "number" ? body.amountCents : NaN;
  const fromUid = decoded.uid;

  if (!toUid || toUid === fromUid) {
    return NextResponse.json({ ok: false, error: "Invalid recipient" }, { status: 400 });
  }
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return NextResponse.json(
      { ok: false, error: `Amount must be between $${MIN_CENTS / 100} and $${MAX_CENTS / 100}` },
      { status: 400 },
    );
  }

  const toSnap = await adminDb.collection("users").doc(toUid).get();
  const toProvSnap = await adminDb.collection("providers").doc(toUid).get();
  if (!toSnap.exists && !toProvSnap.exists) {
    return NextResponse.json({ ok: false, error: "Recipient not found" }, { status: 404 });
  }

  const fromUser = await getUser(fromUid);
  const blocked = (fromUser as { blocked?: boolean } | null)?.blocked === true;
  if (blocked) {
    return NextResponse.json({ ok: false, error: "Account restricted" }, { status: 403 });
  }

  const fromName = (fromUser?.name as string | undefined) ?? "Someone";
  let toName = "GRIDD user";
  if (toSnap.exists) {
    const d = toSnap.data() as { name?: string };
    toName = d.name ?? toName;
  } else if (toProvSnap.exists) {
    const d = toProvSnap.data() as { name?: string };
    toName = d.name ?? "Driver";
  }

  try {
    await transferWalletBetweenUsers({
      fromUid,
      toUid,
      amountCents,
      fromLabel: `Sent to ${toName}`,
      toLabel: `Received from ${fromName}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transfer failed";
    const status = msg.includes("Insufficient") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
