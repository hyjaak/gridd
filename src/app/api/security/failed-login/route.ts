import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * Records failed password attempts (no auth). Rate-limit by IP in production via Vercel edge or add Redis later.
 */
export async function POST(req: Request) {
  if (!adminDb) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = (body?.email ?? "").trim().toLowerCase().slice(0, 320);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }

  const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 512);

  await adminDb.collection("failedLogins").add({
    email,
    ip,
    userAgent: ua,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
