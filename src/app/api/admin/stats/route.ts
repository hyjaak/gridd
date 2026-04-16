import { NextResponse } from "next/server";
import { requireAdminBearer } from "@/lib/admin-auth";
import {
  listProvidersAdmin,
  listRecentJobsForAdmin,
  platformFeeCentsFromTotal,
} from "@/lib/db";
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

  const jobs = await listRecentJobsForAdmin(500).catch(() => [] as Job[]);
  const providers = await listProvidersAdmin(500).catch(() => []);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const tToday = startToday.getTime();
  const weekAgo = now - 7 * dayMs;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const tMonth = monthStart.getTime();

  let revenueToday = 0;
  let weekRevenue = 0;
  let monthRevenue = 0;
  let allTimeRevenue = 0;

  for (const j of jobs) {
    if (j.status !== "completed") continue;
    const fee = feeForJob(j);
    const ct = parseTime(j.completedAt);
    allTimeRevenue += fee;
    if (ct >= tMonth) monthRevenue += fee;
    if (ct >= weekAgo) weekRevenue += fee;
    if (ct >= tToday) revenueToday += fee;
  }

  const activeJobsCount = jobs.filter((j) => j.status === "active").length;

  const liveDriversCount = providers.filter((p) => p.status !== "offline").length;

  const feed = jobs.slice(0, 10);

  return NextResponse.json({
    ok: true,
    revenueTodayCents: revenueToday,
    weekRevenueCents: weekRevenue,
    monthRevenueCents: monthRevenue,
    allTimeRevenueCents: allTimeRevenue,
    activeJobsCount,
    liveDriversCount,
    feed,
  });
}
