import { NextResponse } from "next/server";
import { requireAdminBearer } from "@/lib/admin-auth";
import { listRecentJobsForAdmin, platformFeeCentsFromTotal } from "@/lib/db";
import type { Job } from "@/types";

function feeForJob(job: Job): number {
  if (typeof job.platformFeeCents === "number") return job.platformFeeCents;
  const gross = job.amountCents ?? job.chargedTotalCents ?? 0;
  return platformFeeCentsFromTotal(gross);
}

function parseTime(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export async function GET(req: Request) {
  const adminUid = await requireAdminBearer(req);
  if (!adminUid) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const jobs = await listRecentJobsForAdmin(800).catch(() => [] as Job[]);
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const tMonth = monthStart.getTime();

  let allTime = 0;
  let monthTotal = 0;
  const byService: Record<string, number> = {};

  for (const j of jobs) {
    if (j.status !== "completed") continue;
    const fee = feeForJob(j);
    allTime += fee;
    const ct = parseTime(j.completedAt);
    if (ct >= tMonth) monthTotal += fee;
    const sid = j.serviceId ?? "other";
    byService[sid] = (byService[sid] ?? 0) + fee;
  }

  const ranked = Object.entries(byService)
    .map(([serviceId, platformFeeCents]) => ({ serviceId, platformFeeCents }))
    .sort((a, b) => b.platformFeeCents - a.platformFeeCents);

  const projectionNextMonth = Math.round(monthTotal * 1.05);

  return NextResponse.json({
    ok: true,
    allTimeRevenueCents: allTime,
    monthRevenueCents: monthTotal,
    topServices: ranked.slice(0, 12),
    projectionNextMonthCents: projectionNextMonth,
  });
}
