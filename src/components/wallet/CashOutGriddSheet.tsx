"use client";

import { useCallback, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { money } from "@/hooks/useGriddWalletData";

export type CashOutGriddSheetProps = {
  open: boolean;
  onClose: () => void;
  balanceCents: number;
  returnPath: string;
  onDone?: () => void;
};

export function CashOutGriddSheet({ open, onClose, balanceCents, returnPath, onDone }: CashOutGriddSheetProps) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasBank = Boolean(profile?.stripeConnectId);

  const connectBank = useCallback(async () => {
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) {
      setErr("Sign in required");
      return;
    }
    setBankBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/connect-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ returnPath }),
      });
      const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) throw new Error(j.error ?? "Could not open bank setup");
      window.location.href = j.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bank setup failed");
    } finally {
      setBankBusy(false);
    }
  }, [returnPath]);

  const cashOut = useCallback(async () => {
    const dollars = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents < 500) {
      setErr("Minimum cash out is $5.00");
      return;
    }
    if (cents > balanceCents) {
      setErr("Insufficient balance");
      return;
    }
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) {
      setErr("Sign in required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/wallet/customer-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountCents: cents }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Cash out failed");
      onDone?.();
      onClose();
      setAmount("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cash out failed");
    } finally {
      setBusy(false);
    }
  }, [amount, balanceCents, onClose, onDone]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[min(92vh,640px)] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border)] bg-[#0a0a0a] p-5 shadow-xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[var(--text)]">Cash out</h2>
          <button type="button" className="text-sm text-zinc-500 hover:text-zinc-300" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--sub)]">
          Available: {money(balanceCents)} · Min $5.00 · Stripe transfers to your linked bank.
        </p>

        {!hasBank ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-400">Connect a US bank account with Stripe to receive payouts.</p>
            {err ? <p className="text-sm text-red-400">{err}</p> : null}
            <Button type="button" className="w-full" disabled={bankBusy} onClick={() => void connectBank()}>
              {bankBusy ? "Opening…" : "Connect bank (Stripe)"}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-emerald-500/90">Bank connected — you can cash out to your account.</p>
            <label className="block text-xs text-zinc-500">Amount (USD)</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
            {err ? <p className="text-sm text-red-400">{err}</p> : null}
            <Button type="button" variant="secondary" className="w-full text-sm" disabled={bankBusy} onClick={() => void connectBank()}>
              Update bank details
            </Button>
            <Button type="button" className="w-full" disabled={busy} onClick={() => void cashOut()}>
              {busy ? "Processing…" : "Confirm cash out"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
