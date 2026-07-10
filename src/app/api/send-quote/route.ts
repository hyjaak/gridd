import { NextResponse } from "next/server";
import Twilio from "twilio";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN ?? "";
const twilioPhone = process.env.TWILIO_PHONE ?? "";

function canSendSms(): boolean {
  return !!(
    twilioAccountSid &&
    twilioAuthToken &&
    twilioPhone &&
    !twilioAccountSid.includes("PASTE") &&
    !twilioAuthToken.includes("PASTE") &&
    !twilioPhone.includes("PASTE")
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      jobId?: string;
      amount?: number;
      phone?: string;
    } | null;

    if (!body) {
      return NextResponse.json({ error: "Missing request body" }, { status: 400 });
    }

    const { jobId, amount, phone } = body;

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Missing required field: jobId" }, { status: 400 });
    }
    if (amount == null || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Missing or invalid field: amount (must be a positive number)" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Missing required field: phone" }, { status: 400 });
    }

    if (!canSendSms()) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 502 });
    }

    const client = Twilio(twilioAccountSid, twilioAuthToken);

    const message = await client.messages.create({
      from: twilioPhone,
      to: phone,
      body: `GRIDD quote: $${amount.toFixed(2)} flat for your job. Reply YES to book — same-day when possible.`,
    });

    return NextResponse.json({ ok: true, sid: message.sid });
  } catch (e) {
    console.error("send-quote error:", e);
    return NextResponse.json(
      { error: "Failed to send SMS via Twilio" },
      { status: 502 },
    );
  }
}