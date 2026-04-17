import { NextResponse } from "next/server";
import { Resend } from "resend";
import { griddEmailShell, GRIDD_FROM_VERIFY } from "@/lib/resend-brand";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; name?: string } | null;
  const email = body?.email?.trim();
  const name = body?.name?.trim() ?? "there";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
  }

  if (!resend) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const html = griddEmailShell(`
    <p style="font-size:16px;line-height:1.6;color:#ccc;margin-top:16px;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">Welcome to <strong style="color:#00FF88;">The Neighborhood Economy</strong>.</p>
    <p style="font-size:15px;line-height:1.6;color:#aaa;">We sent a verification link to this address from Firebase. If you don&apos;t see it, check spam.</p>
    <p style="font-size:14px;line-height:1.6;color:#666;margin-top:20px;">If you didn&apos;t create a GRIDD account, you can ignore this email.</p>
  `);

  const { error } = await resend.emails.send({
    from: GRIDD_FROM_VERIFY,
    to: email,
    subject: "Verify your GRIDD account",
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
