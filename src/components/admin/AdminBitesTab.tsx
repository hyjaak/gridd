"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  limit,
  doc,
  where,
} from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { estimateOrderEconomics } from "@/lib/bitesPricing";
import type { BiteOrder } from "@/types/bites";
import app from "@/lib/firebase";
import { AdminManualRestaurantForm } from "@/components/admin/AdminManualRestaurantForm";
import { EmptyState } from "@/components/admin/EmptyState";

const BG = "#0a0a0a";
const CARD = "#111";
const BORDER = "#1e1e1e";
const G = "#3dff7a";
const O = "#ff6b00";

const STATUS_EMOJI: Record<string, string> = {
  manual_pending: "🖐️",
  pending: "🟡",
  confirmed: "🟠",
  doordash_created: "🟠",
  dasher_assigned: "🔵",
  arrived_at_restaurant: "🟣",
  picked_up: "🟣",
  almost_there: "🟢",
  en_route: "🟢",
  delivered: "✅",
  cancelled: "❌",
  failed: "❌",
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function startOfLocalDayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function AdminBitesTab() {
  const db = useMemo(() => getFirestore(app), []);
  const [rows, setRows] = useState<(BiteOrder & { id: string })[]>([]);
  const [revenue, setRevenue] = useState<{ balanceCents?: number; totalOrders?: number } | null>(null);
  const [restaurants, setRestaurants] = useState<
    { id: string; name?: string; isOpen?: boolean; isManualEntry?: boolean }[]
  >([]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "biteOrders"), orderBy("createdAt", "desc"), limit(120)),
      (s) => {
        setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as BiteOrder) })));
      },
      () => setRows([]),
    );
  }, [db]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "revenue", "bites"),
      (s) => {
        if (s.exists()) {
          const d = s.data() as { balanceCents?: number; totalOrders?: number };
          setRevenue(d);
        } else setRevenue({ balanceCents: 0, totalOrders: 0 });
      },
      () => setRevenue(null),
    );
  }, [db]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "restaurants"), orderBy("createdAt", "desc"), limit(500)),
      (s) =>
        setRestaurants(
          s.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              name: typeof x.name === "string" ? x.name : undefined,
              isOpen: x.isOpen !== false,
              isManualEntry: x.isManualEntry === true,
            };
          }),
        ),
      () => setRestaurants([]),
    );
  }, [db]);

  const todayMs = startOfLocalDayMs();
  const stats = useMemo(() => {
    let todayCount = 0;
    let todayGross = 0;
    let griddit = 0;
    const byStatus: Record<string, number> = {};
    let active = 0;
    for (const o of rows) {
      const ca = o.createdAt;
      const ms = ca instanceof Timestamp ? ca.toMillis() : 0;
      if (ms >= todayMs) {
        todayCount += 1;
        todayGross += o.total ?? 0;
      }
      griddit += o.gridditCount ?? 0;
      const st = o.status || "unknown";
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (st !== "delivered" && st !== "cancelled" && st !== "failed") active += 1;
    }
    const dayEcon = rows
      .filter((o) => {
        const ca = o.createdAt;
        const ms = ca instanceof Timestamp ? ca.toMillis() : 0;
        return ms >= todayMs;
      })
      .reduce(
        (acc, o) => {
          const e = estimateOrderEconomics(o.subtotal ?? 0, o.deliveryFee ?? 3.99, 0.12, 0.15, 8, o.tip ?? 0);
          return acc + e.griddNetPerOrder;
        },
        0,
      );
    return { todayCount, todayGross, griddit, byStatus, active, dayEcon };
  }, [rows, todayMs]);

  const restStats = useMemo(() => {
    const byRestaurant: Record<string, { ordersToday: number; revenueToday: number }> = {};
    for (const o of rows) {
      const ms = o.createdAt instanceof Timestamp ? o.createdAt.toMillis() : 0;
      if (ms < todayMs) continue;
      const rid = String(o.restaurantId ?? "");
      if (!rid) continue;
      if (!byRestaurant[rid]) byRestaurant[rid] = { ordersToday: 0, revenueToday: 0 };
      byRestaurant[rid].ordersToday += 1;
      byRestaurant[rid].revenueToday += o.total ?? 0;
    }
    const list = restaurants
      .map((r) => ({
        ...r,
        ordersToday: byRestaurant[r.id]?.ordersToday ?? 0,
        revenueToday: byRestaurant[r.id]?.revenueToday ?? 0,
      }))
      .sort((a, b) => (b.ordersToday - a.ordersToday) || (b.revenueToday - a.revenueToday));
    return { byRestaurant, list };
  }, [rows, restaurants, todayMs]);

  return (
    <div className="space-y-4 p-3 text-left" style={{ color: "#e4e4e7" }}>
      <h2 className="text-lg font-bold" style={{ color: G }}>
        🍗 GRIDD Bites
      </h2>
      <p className="text-sm text-zinc-500">Orders, Drive partner stores, and revenue (Firestore + DoorDash Drive).</p>

      <AdminManualRestaurantForm />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Restaurants", v: String(restaurants.length), sub: "total" },
          { k: "Today", v: String(stats.todayCount), sub: "orders" },
          { k: "Gross (today)", v: fmtMoney(stats.todayGross), sub: "customer" },
          { k: "Active", v: String(stats.active), sub: "deliveries" },
          { k: "Net (est. today)", v: fmtMoney(stats.dayEcon), sub: "12% + del + 15% − $8" },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border p-3" style={{ background: CARD, borderColor: BORDER }}>
            <p className="text-[10px] uppercase text-zinc-500">{x.k}</p>
            <p className="text-xl font-bold" style={{ color: O }}>
              {x.v}
            </p>
            <p className="text-[10px] text-zinc-600">{x.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ background: CARD, borderColor: BORDER }}>
          <p className="text-sm font-bold text-zinc-300">CEO Bites revenue (accum.)</p>
          <p className="text-2xl font-mono" style={{ color: G }}>
            {revenue != null
              ? fmtMoney((revenue.balanceCents ?? 0) / 100)
              : "—"}
          </p>
          <p className="text-xs text-zinc-500">revenue/bites balanceCents (90% of est. net on delivered)</p>
        </div>
        <div className="rounded-xl border p-3" style={{ background: CARD, borderColor: BORDER }}>
          <p className="text-sm font-bold text-zinc-300">DoorDash Drive</p>
          <p className="text-lg" style={{ color: G }}>
            🟢 Webhook: /api/bites/webhook
          </p>
          <p className="text-xs text-zinc-500">Listings come from your Drive developer businesses + stores (OpenAPI).</p>
        </div>
      </div>

      <div className="rounded-xl border p-3" style={{ background: CARD, borderColor: BORDER }}>
        <p className="mb-2 text-sm font-bold text-zinc-300">GRIDD ITs (all loaded orders)</p>
        <p className="text-2xl font-mono" style={{ color: O }}>
          {stats.griddit}
        </p>
      </div>

      <div className="rounded-xl border p-3" style={{ background: BG, borderColor: BORDER }}>
        <p className="mb-2 text-sm font-bold text-zinc-300">Restaurants</p>
        {restaurants.length === 0 ? (
          <EmptyState icon="🍽️" message={"No restaurants yet.\nAdd your first restaurant above."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Orders today</th>
                  <th className="p-2">Revenue today</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {restStats.list.slice(0, 80).map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800/80">
                    <td className="p-2">{r.name ?? r.id}</td>
                    <td className="p-2 font-mono">{r.ordersToday}</td>
                    <td className="p-2 font-mono">{fmtMoney(r.revenueToday)}</td>
                    <td className="p-2">{r.isOpen === false ? "closed" : "open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ background: BG, borderColor: BORDER }}>
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="p-2">ID</th>
              <th className="p-2">Status</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Restaurant</th>
              <th className="p-2">Total</th>
              <th className="p-2">Dasher</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-zinc-800/80">
                <td className="p-2 font-mono text-[10px] text-zinc-500">{o.id.slice(0, 10)}…</td>
                <td className="p-2">
                  {STATUS_EMOJI[o.status] ?? "⚪"} {o.status}
                </td>
                <td className="p-2">{o.customerName ?? "—"}</td>
                <td className="p-2">{o.restaurantName ?? "—"}</td>
                <td className="p-2 font-mono">{fmtMoney(o.total ?? 0)}</td>
                <td className="p-2 text-zinc-400">{o.dasherName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState icon="🍗" message={"No orders yet.\nFirst order coming soon."} /> : null}
      </div>
    </div>
  );
}
