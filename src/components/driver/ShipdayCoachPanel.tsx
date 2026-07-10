"use client";

import { Card } from "@/components/ui/Card";

const APP_STORE =
  "https://apps.apple.com/us/app/shipday-drive-delivery-driver-app/id1531504620";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.shipday.driver";

/**
 * Shipday Drive is a separate driver app for last-mile dispatch, routing, and POD.
 * GRIDD pushes paid jobs to Shipday when `SHIPDAY_API_KEY` and addresses are configured.
 */
export function ShipdayCoachPanel() {
  return (
    <Card className="overflow-hidden border border-cyan-500/25 bg-gradient-to-br from-cyan-950/40 to-[#0a1214] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/90">Last mile</div>
      <h3 className="mt-1 text-base font-bold text-[var(--text)]">Shipday — be my coach</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--sub)]">
        Use <strong className="text-cyan-200/95">Shipday Drive</strong> for turn-by-turn, queueing, and proof-of-delivery
        when GRIDD syncs your paid gig to Shipday. You still run the job in GRIDD — Shipday is your dispatch coach on the
        road.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={APP_STORE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-white/10 px-3 text-center text-sm font-semibold text-white transition hover:bg-white/15 sm:flex-none"
        >
          App Store
        </a>
        <a
          href={PLAY_STORE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#00FF88]/15 px-3 text-center text-sm font-semibold text-[#00FF88] transition hover:bg-[#00FF88]/25 sm:flex-none"
        >
          Google Play
        </a>
        <a
          href="https://docs.shipday.com/reference/shipday-api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 px-3 text-sm text-[var(--sub)] transition hover:border-white/25 hover:text-[var(--text)]"
        >
          API docs
        </a>
      </div>
    </Card>
  );
}
