"use client";

import { useState } from "react";
import { GlassCard, StatusBadge, SectionTitle } from "./ui";
import { useInventory } from "@/lib/cockpit/hooks";

export default function InventoryPanel() {
  const { data: items } = useInventory();
  const [search, setSearch] = useState("");

  const filtered = search
    ? items.filter(i => i.description.toLowerCase().includes(search.toLowerCase()) || i.id.includes(search))
    : items;

  return (
    <GlassCard className="lg:col-span-1 xl:col-span-2">
      <SectionTitle
        title="Inventory"
        subtitle={`${items.length} items · ${items.filter(i => i.status === "pending").length} pending`}
        action={<StatusBadge status="info" />}
      />

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search inventory..."
        className="w-full mb-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/70 text-sm placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
      />

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto custom-scrollbar">
        {filtered.slice(0, 10).map((item) => (
          <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] transition-colors">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                item.fragile ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
              }`}>
                {item.fragile ? "⚠" : "📦"}
              </div>
              <div>
                <p className="text-sm text-white/80 font-medium">{item.description}</p>
                <p className="text-[10px] text-white/30 font-mono mt-0.5">{item.id} · {item.weight}lbs</p>
              </div>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}