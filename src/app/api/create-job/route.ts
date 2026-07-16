import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const VALID_JOB_TYPES = ["delivery", "errand", "hauling"] as const;
const VALID_MARKETS = ["DAY", "ATL"] as const;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      jobType,
      pickupAddress,
      dropoffAddress,
      customerPhone,
      description,
      timeWindow,
      contactName,
      market,
      estMiles,
      estPrice,
      itemPhotoUrl,
    } = body;

    // ── Validate required fields ──
    if (!jobType || !VALID_JOB_TYPES.includes(jobType)) {
      return NextResponse.json({ ok: false, error: "Invalid job type" }, { status: 400 });
    }
    if (!market || !VALID_MARKETS.includes(market)) {
      return NextResponse.json({ ok: false, error: "Invalid market" }, { status: 400 });
    }
    if (!customerPhone) {
      return NextResponse.json({ ok: false, error: "Phone number is required" }, { status: 400 });
    }
    if (!pickupAddress?.city && !pickupAddress?.street) {
      return NextResponse.json({ ok: false, error: "Pickup address required" }, { status: 400 });
    }
    if (!dropoffAddress?.city && !dropoffAddress?.street) {
      return NextResponse.json({ ok: false, error: "Drop-off address required" }, { status: 400 });
    }

    // Normalize phone to E.164
    const digits = customerPhone.replace(/\D/g, "");
    const normalized =
      digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : digits;

    if (normalized.length < 11) {
      return NextResponse.json({ ok: false, error: "Invalid phone number" }, { status: 400 });
    }

    // ── Build job document ──
    const jobData: Record<string, unknown> = {
      jobType,
      pickupAddress: {
        street: pickupAddress.street?.trim() || "",
        city: pickupAddress.city?.trim() || "",
        unit: pickupAddress.unit?.trim() || "",
        notes: pickupAddress.notes?.trim() || "",
      },
      dropoffAddress: {
        street: dropoffAddress.street?.trim() || "",
        city: dropoffAddress.city?.trim() || "",
        unit: dropoffAddress.unit?.trim() || "",
        notes: dropoffAddress.notes?.trim() || "",
      },
      customerPhone: normalized,
      contactName: contactName?.trim() || "",
      description: description?.trim() || "",
      timeWindow: timeWindow || "",
      itemPhotoUrl: itemPhotoUrl || "",
      market,
      status: "request",
      source: "form",
      assignedTo: "owner",
      payoutPct: 0,
      createdAt: new Date(),
    };

    // Optional estimate fields
    if (typeof estMiles === "number") jobData.estMiles = estMiles;
    if (typeof estPrice === "number") jobData.estPrice = estPrice;

    const ref = await adminDb!.collection("dispatchJobs").add(jobData);

    return NextResponse.json({ ok: true, jobId: ref.id });
  } catch (e) {
    console.error("create-job error:", e);
    return NextResponse.json(
      { ok: false, error: "Failed to create job" },
      { status: 500 }
    );
  }
}