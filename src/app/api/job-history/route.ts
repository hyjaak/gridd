import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { CEO_UID } from "@/lib/constants";

/** Repeat-customer memory — board only. Verify CEO Firebase ID token. */
export async function GET(req: Request) {
  try {
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

    const url = new URL(req.url);
    const phone = url.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "Missing phone" }, { status: 400 });
    }

    const snap = await adminDb!
      .collection("dispatchJobs")
      .where("customerPhone", "==", phone)
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();

    const jobs = snap.docs.map((d) => ({
      id: d.id,
      status: d.data().status,
      pickupAddress: d.data().pickupAddress ?? null,
      dropoffAddress: d.data().dropoffAddress ?? null,
      agreedAmount: d.data().agreedAmount ?? d.data().quoteAmount ?? null,
      quoteAmount: d.data().quoteAmount ?? null,
      createdAt: d.data().createdAt ?? null,
    }));

    return NextResponse.json({ jobs });
  } catch (e) {
    console.error("job-history error:", e);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}