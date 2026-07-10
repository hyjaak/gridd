"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";

type DiscountRow = {
  id: string;
  customerId?: string;
  jobId?: string;
  service?: string;
  originalPrice?: number;
  discountAmount?: number;
  finalPrice?: number;
  triggerRule?: string;
  displayText?: string;
  griddProfitAfter?: number;
  createdAt?: Timestamp | { toDate?: () => Date };
};

function rowTime(r: DiscountRow): number {
  const c = r.createdAt;
  if (c instanceof Timestamp) return c.toMillis();
  if (c && typeof c === "object" && "toDate" in c && typeof c.toDate === "function") {
    return c.toDate().getTime();
  }
  return 0;
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function AdminDiscountsTab() {
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);
  const [rows, setRows] = useState<DiscountRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "discounts"), orderBy("createdAt", "desc"), limit(800));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setErr(null);
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DiscountRow, "id">),
          })),
        );
      },
      (e) => setErr(e.message),
    );
    return () => unsub();
  }, [db]);

  const todayStart = startOfTodayMs();
  const todayRows = useMemo(
    () => rows.filter((r) => rowTime(r) >= todayStart),
    [rows, todayStart],
  );

  const stats = useMemo(() => {
    let count = 0;
    let totalDiscount = 0;
    let totalProfitAfter = 0;
    const ruleHits: Record<string, number> = {};
    let newCustomerConversions = 0;
    for (const r of todayRows) {
      count += 1;
      totalDiscount += r.discountAmount ?? 0;
      if (typeof r.griddProfitAfter === "number" && !Number.isNaN(r.griddProfitAfter)) {
        totalProfitAfter += r.griddProfitAfter;
      }
      const tr = r.triggerRule ?? "unknown";
      ruleHits[tr] = (ruleHits[tr] ?? 0) + 1;
      if (tr === "new_customer_acquisition") newCustomerConversions += 1;
    }
    let topRule = "—";
    let topN = 0;
    for (const [k, v] of Object.entries(ruleHits)) {
      if (v > topN) {
        topN = v;
        topRule = k;
      }
    }
    return {
      count,
      totalDiscount,
      totalProfitAfter,
      topRule,
      newCustomerConversions,
    };
  }, [todayRows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Smart Discounts</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Logged when a customer receives a Smart Discount at booking. Internal trigger rules are never shown to
          customers.
        </p>
      </div>

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Discounts today" value={String(stats.count)} />
        <Stat
          label="Total discount $"
          value={stats.totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        />
        <Stat
          label="Est. GRIDD profit after"
          value={stats.totalProfitAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        />
        <Stat label="Most triggered rule" value={stats.topRule} />
        <Stat label="New customer conversions" value={String(stats.newCustomerConversions)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm text-zinc-300">
          <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Original</th>
              <th className="px-3 py-2">Final</th>
              <th className="px-3 py-2">Trigger (internal)</th>
              <th className="px-3 py-2">Customer saw</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No discount events yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/80">
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                    {r.createdAt instanceof Timestamp
                      ? r.createdAt.toDate().toLocaleString()
                      : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.jobId ?? "—"}</td>
                  <td className="px-3 py-2">{r.service ?? "—"}</td>
                  <td className="px-3 py-2">
                    {(r.originalPrice ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </td>
                  <td className="px-3 py-2 text-[#3dff7a]">
                    {(r.finalPrice ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{r.triggerRule ?? "—"}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs" title={r.displayText}>
                    {r.displayText ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-[#3dff7a]">{value}</div>
    </div>
  );
}
