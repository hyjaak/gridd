import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { jobId, rating, comment } = await req.json();
    const r = Number(rating);
    if (!jobId || !Number.isInteger(r) || r < 1 || r > 5) {
      return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
    }

    const ref = adminDb!.collection("dispatchJobs").doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const data = snap.data()!;
    if (data.status !== "paid") {
      return NextResponse.json({ error: "Only paid jobs can be rated" }, { status: 400 });
    }
    if (data.rating != null) {
      return NextResponse.json({ error: "Already rated" }, { status: 400 });
    }

    await ref.update({
      rating: r,
      ...(typeof comment === "string" && comment.trim() ? { ratingComment: comment.trim().slice(0, 200) } : {}),
      ratedAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("rate-job error:", e);
    return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
  }
}