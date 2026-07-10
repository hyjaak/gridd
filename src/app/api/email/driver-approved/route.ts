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
    <p style="font-size:18px;font-weight:700;color:#00FF88;margin-top:16px;">Welcome to GRIDD! 🔥</p>
    <p style="font-size:16px;line-height:1.6;color:#ccc;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">You&apos;re officially approved to start earning on the GRIDD platform.</p>
    <p style="font-size:15px;line-height:1.6;color:#fbbf24;font-weight:600;">IMPORTANT REMINDER:</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">Before accepting your first job, make sure you have active <strong>commercial auto insurance</strong> or a <strong>commercial endorsement</strong> on your personal policy.</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">This protects <strong>you</strong> if anything happens while you&apos;re working.</p>
    <p style="font-size:16px;font-weight:700;color:#00FF88;margin-top:20px;">You can go ON THE GRIDD ⚡ now!</p>
    <p style="font-size:14px;line-height:1.6;color:#888;">Questions? <a href="mailto:support@gridd.click" style="color:#00FF88;">support@gridd.click</a></p>
    <p style="font-size:14px;color:#999;margin-top:20px;">— The GRIDD Team 👑</p>
    <a href="https://gridd.click/" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#00FF88,#00CC66);color:#000;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:12px;">Open GRIDD</a>
  `);

  const { error } = await resend.emails.send({
    from: GRIDD_FROM_DRIVERS,
    to: email,
    subject: "✅ You're approved for GRIDD!",
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
