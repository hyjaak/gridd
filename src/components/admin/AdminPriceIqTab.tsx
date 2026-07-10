"use client";

import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type BoardRow = {
  miles: number;
  minutes: number;
  /** Still returned by API; not shown in this dashboard (customer-facing PriceIQ only). */
  griddList?: number;
  uber: number;
  priceIq: number;
  youSave: number | null;
  uberSource: "live" | "proxy";
};

type BoardPayload = {
  ok: boolean;
  zip?: string;
  center?: { lat: number; lng: number };
  updatedAt?: string;
  beatsUberOnAll?: boolean;
  anySurge?: boolean;
  realTime?: { intervalSec?: number; minSavingsUsd?: number; label?: string };
  daily?: { label?: string; services?: string };
  rows?: BoardRow[];
  error?: string;
};

export function AdminPriceIqTab() {
  const [zip, setZip] = useState("30309");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<BoardPayload | null>(null);

  const load = useCallback(async (z: string) => {
    if (!firebaseAuth?.currentUser) {
      setErr("Sign in required");
      return;
    }
    if (z.replace(/\D/g, "").length !== 5) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch(`/api/ceo/price-iq-board?zip=${encodeURIComponent(z)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as BoardPayload;
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to load board");
      }
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (zip.length === 5) void load(zip);
  }, [zip, load]);

  const rows = data?.rows ?? [];
  const showProxyNote = rows.some((r) => r.uberSource === "proxy");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">PriceIQ™ 2.0</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Rides: real-time Uber <code className="text-zinc-400">/estimates/price</code> with a <strong>minimum $1.84</strong> or{" "}
          <strong>3.2%</strong> customer savings (whichever is higher). Other services: daily Perplexity + 24h cache.
        </p>
      </div>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className="rounded-2xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm"
            data-tier="realtime"
          >
            <p className="font-bold text-red-200">🔴 {data.realTime?.label ?? "REAL TIME MONITOR"} (rides)</p>
            <p className="mt-1 text-zinc-400">Poll client/booking ~60s; server benchmark: cron daily in ZIP.</p>
            <p className="mt-1 text-zinc-300">
              Min savings: <span className="text-[#3dff7a]">${(data.realTime?.minSavingsUsd ?? 1.84).toFixed(2)}+</span>
            </p>
            {data.anySurge ? (
              <p className="mt-1 text-amber-300">Surge detected on at least one benchmark — GRIDD undercuts surged Uber.</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm" data-tier="daily">
            <p className="font-bold text-zinc-200">📅 {data.daily?.label ?? "DAILY MONITOR"}</p>
            <p className="mt-1 text-zinc-500">{data.daily?.services}</p>
            <p className="mt-1 text-xs text-zinc-500">Last board refresh: {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}</p>
            <Button type="button" className="mt-2 text-xs" onClick={() => void load(zip)}>
              Force refresh (rides table)
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Market (US ZIP)</label>
          <Input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="w-32 font-mono"
            maxLength={5}
          />
        </div>
        <Button type="button" disabled={loading || zip.length !== 5} onClick={() => void load(zip)}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
        {data?.updatedAt ? (
          <span className="text-xs text-zinc-500">Updated {new Date(data.updatedAt).toLocaleString()}</span>
        ) : null}
      </div>

      {err ? <p className="text-sm text-amber-400">{err}</p> : null}

      {data?.beatsUberOnAll ? (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-4 py-3 text-sm text-[#3dff7a]">
          🟢 GRIDD is cheaper than Uber
          <br />
          on every route ✅
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="p-3">Route</th>
              <th className="p-3">Uber est.</th>
              <th className="p-3 text-[#3dff7a]">GRIDD PriceIQ™</th>
              <th className="p-3">You Save 💚</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.miles} className="border-b border-zinc-900/80">
                <td className="p-3 font-mono text-zinc-200">
                  {r.miles} mi · {r.minutes} min
                </td>
                <td className="p-3 font-mono text-zinc-300">${r.uber.toFixed(2)}</td>
                <td className="p-3 font-mono font-semibold text-[#3dff7a]">${r.priceIq.toFixed(2)}</td>
                <td className="p-3 font-mono text-zinc-300">
                  {r.youSave != null && r.youSave > 0 ? `$${r.youSave.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="p-4 text-zinc-500">
                  No rows
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showProxyNote ? (
        <p className="text-xs text-zinc-500">* Based on Uber&apos;s published rates (no live range from API).</p>
      ) : null}

      <p className="text-xs text-zinc-500">
        Beat % and ride overrides: Pricing tab → <code className="text-zinc-400">ride</code> in{" "}
        <code className="text-zinc-400">pricingConfig</code>. Historical Uber samples:{" "}
        <code className="text-zinc-500">priceHistory</code> in Firestore.
      </p>

      <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4 text-sm text-zinc-400">
        <p className="font-semibold text-zinc-200">Surge alerts &amp; history</p>
        <p className="mt-1">
          Benchmark (10 mi) runs via cron can create <code className="text-zinc-500">ceoAlerts</code>. Intraday
          series: <code className="text-zinc-500">marketRates</code>, <code className="text-zinc-500">priceCache</code>
          , and <code className="text-zinc-500">priceHistory</code>.
        </p>
      </div>
    </div>
  );
}
