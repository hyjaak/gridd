"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function RestaurantOnboardingPage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/bites/restaurant-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: name, address, phone, cuisine, notes }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Failed");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#050505] px-4 py-10 text-white">
      <div className="mx-auto max-w-lg">
        <p className="text-center font-[family-name:var(--font-syne)] text-3xl font-black text-[#ff6b00]">
          GRIDD Bites · Restaurants
        </p>
        <p className="mt-2 text-center text-sm text-zinc-500">Apply to go live on GRIDD. We reach out after CEO review.</p>

        {done ? (
          <Card className="mt-8 border border-[#00FF88]/30 bg-zinc-900/50 p-6 text-center">
            <p className="text-lg font-bold text-[#00FF88]">Application received</p>
            <p className="mt-2 text-sm text-zinc-400">We&apos;ll review your spot and commission terms (default 15%).</p>
            <Button asChild className="mt-6 w-full">
              <Link href="/">Back home</Link>
            </Button>
          </Card>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
            <label className="block text-xs text-zinc-500">
              Business name
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
            </label>
            <label className="block text-xs text-zinc-500">
              Address
              <Input value={address} onChange={(e) => setAddress(e.target.value)} required className="mt-1" />
            </label>
            <label className="block text-xs text-zinc-500">
              Phone
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required className="mt-1" />
            </label>
            <label className="block text-xs text-zinc-500">
              Cuisine
              <Input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="e.g. Chicken, Pizza" className="mt-1" />
            </label>
            <label className="block text-xs text-zinc-500">
              Notes (menu, hours, social)
              <textarea
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            {err ? <p className="text-sm text-red-400">{err}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Submit application"}
            </Button>
            <p className="text-center text-[10px] text-zinc-600">
              Bank / Stripe onboarding happens after approval. DoorDash Drive delivers for you.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
