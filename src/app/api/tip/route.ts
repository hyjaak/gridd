import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/** Tips — customer can add/overwrite a tip until paid; post-paid allowed too. */
export async function POST(req: Request) {
  try {
    const { jobId, amount } = await req.json();
    const amt = Number(amount);
    if (!jobId || isNaN(amt) || amt < 1 || amt > 200) {
      return NextResponse.json({ error: "Tip must be $1–$200" }, { status: 400 });
    }

    const ref = adminDb!.collection("dispatchJobs").doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const data = snap.data()!;
    if (!["proof", "paid"].includes(data.status)) {
      return NextResponse.json({ error: "Tips open after delivery" }, { status: 400 });
    }

    await ref.update({ tipAmount: amt });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("tip error:", e);
    return NextResponse.json({ error: "Failed to save tip" }, { status: 500 });
  }
}