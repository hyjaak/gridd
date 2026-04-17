import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdminBearer } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { griddEmailShell, GRIDD_FROM_DRIVERS } from "@/lib/resend-brand";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { uid?: string; reason?: string } | null;
  const uid = body?.uid?.trim();
  const reason = body?.reason?.trim() ?? "We couldn&apos;t approve your application.";
  if (!uid || !adminDb) {
    return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });
  }

  const snap = await adminDb.collection("providers").doc(uid).get();
  const email = (snap.data() as { email?: string } | undefined)?.email;
  const name = (snap.data() as { name?: string } | undefined)?.name ?? "Driver";

  if (!email) {
    return NextResponse.json({ ok: false, error: "No email on file" }, { status: 400 });
  }

  if (!resend) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const html = griddEmailShell(`
    <p style="font-size:16px;line-height:1.6;color:#ccc;margin-top:16px;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">We reviewed your driver application.</p>
    <p style="font-size:15px;line-height:1.6;color:#f87171;">We couldn&apos;t approve it because:</p>
    <p style="font-size:15px;line-height:1.6;color:#eee;border-left:3px solid #FFB800;padding-left:12px;">${escapeHtml(reason)}</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">Fix the issue and resubmit from the signup flow when you&apos;re ready.</p>
    <a href="https://gridd.click/signup" style="display:inline-block;margin-top:20px;border:1px solid #333;color:#eee;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:12px;">Back to signup</a>
  `);

  const { error } = await resend.emails.send({
    from: GRIDD_FROM_DRIVERS,
    to: email,
    subject: "GRIDD Application — Action Required",
    html,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
