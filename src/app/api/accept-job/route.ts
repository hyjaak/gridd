import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const ref = adminDb!.collection("dispatchJobs").doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const data = snap.data()!;
    if (data.status !== "quoted") {
      return NextResponse.json({ error: "Job is not in quoted state" }, { status: 400 });
    }

    const agreedAmount = data.offerAmount ?? data.quoteAmount;
    await ref.update({ status: "accepted", acceptedAt: new Date(), agreedAmount });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("accept-job error:", e);
    return NextResponse.json({ error: "Failed to accept job" }, { status: 500 });
  }
}