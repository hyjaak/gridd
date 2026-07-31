import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { CEO_UID } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const { jobId, amount, by } = await req.json();
    if (!jobId || amount == null || typeof amount !== "number" || amount < 20 || amount > 500) {
      return NextResponse.json({ error: "Invalid amount (must be 20–500)" }, { status: 400 });
    }

    const who: "owner" | "customer" = by === "owner" ? "owner" : "customer";

    // Owner counters are CEO-only — verify the Firebase ID token.
    if (who === "owner") {
      const authHeader = req.headers.get("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      let uid: string | null = null;
      if (token && adminAuth) {
        try {
          const decoded = await adminAuth.verifyIdToken(token);
          uid = decoded.uid;
        } catch {}
      }
      if (uid !== CEO_UID) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
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

    const existingLog = data.offerLog ?? [];
    const log = [...existingLog, { by: who, amount, at: new Date() }].slice(-20);

    await ref.update({
      offerAmount: amount,
      offerBy: who,
      offerLog: log,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("counter-offer error:", e);
    return NextResponse.json({ error: "Failed to submit offer" }, { status: 500 });
  }
}