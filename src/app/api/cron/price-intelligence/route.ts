import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GRIDD_PRICING } from "@/lib/pricing";

const SERVICES = Object.keys(GRIDD_PRICING);

/**
 * Scheduled refresh for PriceIQ™ competitor cache (top ZIPs × services).
 * Protect with CRON_SECRET — Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Admin not configured" }, { status: 500 });
  }

  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: true, skipped: true, reason: "PERPLEXITY_API_KEY missing" });
  }

  const snap = await adminDb.collection("jobs").limit(400).get().catch(() => null);
  const zipCounts: Record<string, number> = {};
  snap?.docs.forEach((d) => {
    const z = String(d.data()?.zip ?? "").replace(/\D/g, "").slice(0, 5);
    if (z.length === 5) zipCounts[z] = (zipCounts[z] ?? 0) + 1;
  });
  const topZips = Object.entries(zipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([z]) => z);

  if (topZips.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "No ZIPs from recent jobs" });
  }

  let updated = 0;
  const miles = 5;

  for (const zip of topZips) {
    for (const service of SERVICES) {
      const prompt = [
        `What is a typical all-in price in USD for a "${service}" local service`,
        `in ZIP code ${zip} for roughly ${miles} miles distance?`,
        `Reply with ONLY one decimal number (USD), no words.`,
      ].join(" ");

      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 80,
        }),
      }).catch(() => null);

      if (!res?.ok) continue;
      const data = (await res.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
      } | null;
      const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
      const m = text.match(/(\d+(?:\.\d+)?)/);
      const n = m ? parseFloat(m[1]) : NaN;
      if (!Number.isFinite(n) || n <= 0) continue;

      const price = Math.round(n * 100) / 100;
      const docId = `${service}_${zip}`.replace(/[/\\]/g, "_");
      await adminDb
        .collection("priceIntelligence")
        .doc(docId)
        .set(
          {
            averagePrice: price,
            perMileRate: price / miles,
            service,
            zipCode: zip,
            lastUpdated: FieldValue.serverTimestamp(),
            source: "perplexity_ai_cron",
          },
          { merge: true },
        );
      updated += 1;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return NextResponse.json({ ok: true, updated, zips: topZips.length });
}
