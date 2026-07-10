import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Twilio inbound SMS webhook.
 *
 * Incoming message from Twilio (form POST with `From` and `Body`).
 * - "YES" / "yeah" / "yep" / "y" → find newest quoted job for that phone → accept it
 * - anything else → create a new dispatchJobs doc (status=request, source=sms)
 *
 * Set in Twilio Console (Phone Numbers → Active Numbers → Messaging):
 *   A message comes in → Webhook: https://YOUR_DOMAIN/api/twilio-inbound
 *   HTTP POST
 */

const YES_PATTERNS = /^(yes|yeah|yep|y)\b/i;

export async function POST(req: Request) {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const from: string = params.get("From") ?? "";
  const body: string = params.get("Body") ?? "";

  if (!from || !body) {
    return buildTwiL("Missing From or Body");
  }

  const phoneClean = from.replace(/\D/g, "");

  try {
    if (YES_PATTERNS.test(body.trim())) {
      // ── Customer said YES — accept the newest quoted job for this phone ──
      const quotedJobs = await adminDb!
        .collection("dispatchJobs")
        .where("customerPhone", "==", from)
        .where("status", "==", "quoted")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (quotedJobs.empty) {
        return buildTwiL(
          "We couldn't find a pending quote for your number. Text us what you need and we'll send a price. \u2014 GRIDD",
        );
      }

      const jobDoc = quotedJobs.docs[0];
      await jobDoc.ref.update({
        status: "assigned",
        assignedTo: "owner",
        acceptedAt: new Date(),
      });

      return buildTwiL(
        "Locked in. We'll text you when we're on the move. \u2014 GRIDD",
      );
    }

    // ── Anything else — create a new job request ──
    const jobData = {
      market: "DAY",
      status: "request",
      customerName: phoneClean,
      customerPhone: from,
      jobType: "delivery",
      pickupCity: "",
      dropoffCity: "",
      description: body.trim(),
      source: "sms",
      payoutPct: 0,
      createdAt: new Date(),
    };

    await adminDb!.collection("dispatchJobs").add(jobData);

    return buildTwiL(
      "Got it \u2014 pricing your job now. You'll have a flat quote shortly. \u2014 GRIDD",
    );
  } catch (e) {
    console.error("twilio-inbound error:", e);
    return buildTwiL("Something went wrong. Please try again later. \u2014 GRIDD");
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/\u2018/g, "\u0026apos;")
    .replace(/\u2019/g, "\u0026apos;")
    .replace(/'/g, "\u0026apos;");
}

function buildTwiL(message: string): Response {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response><Message>" +
    escapeXml(message) +
    "</Message></Response>";
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}