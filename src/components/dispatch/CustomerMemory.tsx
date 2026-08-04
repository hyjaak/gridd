"use client";

import { useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";

type PriorJob = {
  id: string;
  status: string;
  pickupAddress: { street?: string; city: string } | null;
  dropoffAddress: { street?: string; city: string } | null;
  agreedAmount: number | null;
  quoteAmount: number | null;
  createdAt: any;
};

function addr(a: { street?: string; city: string } | null): string {
  if (!a) return "?";
  return a.street ? `${a.street}, ${a.city}` : a.city;
}

/** Repeat-customer memory — board only (never exposed on the customer form). */
export default function CustomerMemory({ phone, onPrefill }: {
  phone: string;
  onPrefill: (amount: number) => void;
}) {
  const [prior, setPrior] = useState<PriorJob | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPrior(null);
    setLoaded(false);
    if (!phone) { setLoaded(true); return; }
    (async () => {
      try {
        const token = await firebaseAuth?.currentUser?.getIdToken();
        const res = await fetch(`/api/job-history?phone=${encodeURIComponent(phone)}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const jobs: PriorJob[] = data.jobs ?? [];
        if (jobs.length > 0) {
          const last = jobs[0];
          setPrior(last);
          const amt = last.agreedAmount ?? last.quoteAmount;
          if (amt) onPrefill(amt);
        }
      } catch {
        // silent — no memory, no noise
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  if (!prior || !loaded) return null;

  return (
    <div className="bg-[#f2faf6] border border-[#0e9f6e]/20 rounded-xl px-3 py-2 text-[11px] text-[#5c6a62] font-semibold">
      👋 Seen before — last: {addr(prior.pickupAddress)} → {addr(prior.dropoffAddress)}, ${prior.agreedAmount ?? prior.quoteAmount ?? "?"}
    </div>
  );
}