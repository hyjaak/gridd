"use client";

import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { money } from "@/hooks/useGriddWalletData";

type Hit = { uid: string; name: string; photo: string | null };

export type SendGriddSheetProps = {
  open: boolean;
  onClose: () => void;
  balanceCents: number;
  onSent?: () => void;
};

export function SendGriddSheet({ open, onClose, balanceCents, onSent }: SendGriddSheetProps) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Hit | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = useCallback(() => {
    setQ("");
    setHits([]);
    setSelected(null);
    setAmount("");
    setErr(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const t = q.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(t)}`);
        const j = (await res.json()) as { ok?: boolean; results?: Hit[] };
        if (!cancelled && j.ok && Array.isArray(j.results)) setHits(j.results);
        else if (!cancelled) setHits([]);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [q, open]);

  const send = useCallback(async () => {
    if (!selected) return;
    const dollars = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents < 100) {
      setErr("Minimum send is $1.00");
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
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ toUid: selected.uid, amountCents: cents }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Transfer failed");
      onSent?.();
      onClose();
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }, [amount, balanceCents, onClose, onSent, reset, selected]);

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
          <h2 className="text-lg font-bold text-[var(--text)]">Send GRIDD</h2>
          <button type="button" className="text-sm text-zinc-500 hover:text-zinc-300" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--sub)]">Search by name or email. Available: {money(balanceCents)}</p>

        {!selected ? (
          <div className="mt-4 space-y-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or email…"
              autoComplete="off"
            />
            {loading ? <p className="text-xs text-zinc-500">Searching…</p> : null}
            <ul className="max-h-48 space-y-1 overflow-auto">
              {hits.map((h) => (
                <li key={h.uid}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-left text-sm hover:bg-white/5"
                    onClick={() => setSelected(h)}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold">
                      {h.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        h.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="text-zinc-200">{h.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-300">
              To: <span className="font-semibold text-white">{selected.name}</span>
            </p>
            <button type="button" className="text-xs text-[#3B82F6] hover:underline" onClick={() => setSelected(null)}>
              Change recipient
            </button>
            <label className="block text-xs text-zinc-500">Amount (USD)</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
            {err ? <p className="text-sm text-red-400">{err}</p> : null}
            <Button type="button" className="w-full" disabled={busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Confirm send"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
