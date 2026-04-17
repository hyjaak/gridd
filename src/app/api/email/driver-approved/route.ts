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

  const body = (await req.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid?.trim();
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
    <p style="font-size:18px;font-weight:700;color:#00FF88;margin-top:16px;">You&apos;re in the grid.</p>
    <p style="font-size:16px;line-height:1.6;color:#ccc;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">Your driver account is now <strong style="color:#00FF88;">active</strong>.</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">Download the app and go online to start accepting jobs. You keep <strong>85%</strong> of every job.</p>
    <a href="https://gridd.click/login" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#00FF88,#00CC66);color:#000;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:12px;">Open GRIDD</a>
  `);

  const { error } = await resend.emails.send({
    from: GRIDD_FROM_DRIVERS,
    to: email,
    subject: "🎉 Welcome to GRIDD — You're Approved!",
    html,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
