"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BINTA_MILESTONES_USD } from "@/lib/binta-vault";

type MainState = {
  balanceCents: number;
  totalDepositedCents: number;
  totalWithdrawnCents: number;
  monthlyGoalCents: number;
  lastDepositAmountCents?: number;
  name?: string;
};

type TxRow = {
  id: string;
  type?: string;
  amountCents?: number;
  jobId?: string;
  serviceName?: string;
  reason?: string;
  balanceAfterCents?: number;
  createdAtMs?: number | null;
  ipAddress?: string;
};

function centsToMoney(c: number) {
  return (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function txTime(r: TxRow): number {
  return typeof r.createdAtMs === "number" && r.createdAtMs > 0 ? r.createdAtMs : 0;
}

export function AdminBintaVaultTab() {
  const [main, setMain] = useState<MainState | null>(null);
  const [tx, setTx] = useState<TxRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const [goalInput, setGoalInput] = useState("");
  const [goalBusy, setGoalBusy] = useState(false);

  const [wAmount, setWAmount] = useState("");
  const [wReason, setWReason] = useState("");
  const [wStep, setWStep] = useState<"idle" | "confirm">("idle");
  const [wBusy, setWBusy] = useState(false);

  const load = useCallback(async () => {
    if (!firebaseAuth?.currentUser) return;
    setLoading(true);
    setErr(null);
    setForbidden(false);
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const r = await fetch("/api/ceo/vault", { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 404) {
        setForbidden(true);
        setMain(null);
        setTx([]);
        return;
      }
      const j = (await r.json()) as {
        ok?: boolean;
        main?: MainState;
        transactions?: TxRow[];
        error?: string;
      };
      if (!j.ok) {
        setErr(j.error ?? "Load failed");
        return;
      }
      setMain(j.main ?? null);
      setTx((j.transactions as TxRow[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const savedTodayCents = useMemo(() => {
    let s = 0;
    for (const t of tx) {
      if (t.type !== "deposit") continue;
      if (txTime(t) < startOfToday) continue;
      s += t.amountCents ?? 0;
    }
    return s;
  }, [tx, startOfToday]);

  const monthProgress = useMemo(() => {
    if (!main) return 0;
    return Math.min(1, (main.balanceCents ?? 0) / Math.max(1, main.monthlyGoalCents));
  }, [main]);

  const estDaysToGoal = useMemo(() => {
    if (!main) return "—";
    const remain = Math.max(0, main.monthlyGoalCents - main.balanceCents);
    if (remain <= 0) return "0";
    if (savedTodayCents <= 0) return "—";
    const daily = savedTodayCents; // use today as proxy; rough
    return String(Math.ceil(remain / daily));
  }, [main, savedTodayCents]);

  const serviceApprox = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tx) {
      if (t.type !== "deposit") continue;
      const n = t.serviceName || t.type || "Other";
      map[n] = (map[n] ?? 0) + (t.amountCents ?? 0);
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [tx]);

  const sixMonthProjectionCents = useMemo(() => {
    if (!main) return 0;
    if (tx.length < 2) return Math.round((main.totalDepositedCents * 6) / 12);
    const deposits = tx.filter((r) => r.type === "deposit" && (r.amountCents ?? 0) > 0);
    const n = Math.min(30, deposits.length);
    if (n === 0) return 0;
    const last = deposits.slice(0, n);
    const sum = last.reduce((a, t) => a + (t.amountCents ?? 0), 0);
    const avg = sum / n;
    return Math.round(avg * 180);
  }, [tx, main]);

  const setGoal = useCallback(async () => {
    const c = Math.round((parseFloat(goalInput) || 0) * 100);
    if (c < 0) return;
    setGoalBusy(true);
    try {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch("/api/ceo/vault/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monthlyGoalCents: c }),
      });
      if (r.ok) {
        setGoalInput("");
        await load();
      }
    } finally {
      setGoalBusy(false);
    }
  }, [goalInput, load]);

  const doWithdraw = useCallback(async () => {
    const cents = Math.round((parseFloat(wAmount) || 0) * 100);
    if (cents < 1 || wReason.trim().length < 4) return;
    if (wStep === "idle") {
      setWStep("confirm");
      return;
    }
    setWBusy(true);
    setErr(null);
    try {
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch("/api/ceo/vault/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountCents: cents,
          reason: wReason.trim(),
          confirm: true,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (j.ok) {
        setWStep("idle");
        setWAmount("");
        setWReason("");
        await load();
        return;
      }
      setErr(j.error ?? "Withdrawal failed");
    } finally {
      setWBusy(false);
    }
  }, [wAmount, wReason, wStep, load]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading BINTA vault…</p>;
  }
  if (forbidden) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 text-sm text-zinc-400">
        BINTA GRIDD VAULT is visible only to the primary CEO on the allowlisted account. Fund movements are
        server-authorized only.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">BINTA GRIDD VAULT</h2>
        <p className="mt-1 text-sm text-zinc-500">
          CEO emergency fund. 10% of your CEO share (90% of platform fee) is saved on every job completion — in the
          background, on the server.
        </p>
      </div>

      {err ? <p className="text-sm text-amber-400">{err}</p> : null}

      {main ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Live balance" value={centsToMoney(main.balanceCents)} accent />
            <Card label="Saved today" value={centsToMoney(savedTodayCents)} />
            <Card label="All-time deposited" value={centsToMoney(main.totalDepositedCents)} />
            <Card label="All-time withdrawn" value={centsToMoney(main.totalWithdrawnCents)} />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Progress to monthly goal</div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-300">
              <span>{centsToMoney(main.balanceCents)}</span>
              <span>Goal {centsToMoney(main.monthlyGoalCents)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-[#3dff7a] transition-all"
                style={{ width: `${Math.round(monthProgress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">Est. days to goal (rough): {estDaysToGoal}</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-zinc-500">
                Set goal ($ / month)
                <Input
                  className="mt-1 w-40 font-mono text-sm"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder={(main.monthlyGoalCents / 100).toFixed(0)}
                />
              </label>
              <Button type="button" variant="secondary" disabled={goalBusy} onClick={() => void setGoal()}>
                Update goal
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-sm font-bold text-zinc-200">Milestones</div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                {BINTA_MILESTONES_USD.map((m) => {
                  const hit = (main.balanceCents / 100) >= m.usd;
                  return (
                    <li
                      key={m.usd}
                      className={hit ? "text-[#3dff7a]" : "text-zinc-500"}
                    >{`${m.emoji} $${m.usd.toLocaleString()} — ${m.label} ${hit ? "✓" : ""}`}</li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-sm font-bold text-zinc-200">6-month projection (pace)</div>
              <p className="mt-1 text-2xl font-mono text-[#3dff7a]">
                +{centsToMoney(sixMonthProjectionCents)}
              </p>
              <p className="text-xs text-zinc-500">From recent deposit cadence. Not a promise.</p>
            </div>
          </div>

          {serviceApprox.length > 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="text-sm font-bold text-zinc-200">Recent mix (from transaction log)</div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {serviceApprox.map(([k, c]) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span className="text-zinc-400">{k}</span>
                    <span className="font-mono text-[#3dff7a]">{centsToMoney(c)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4">
            <div className="text-sm font-bold text-amber-200">Withdraw (logged forever)</div>
            <p className="mt-1 text-xs text-amber-200/80">Reason is required. Confirm twice. IP is stored.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                className="font-mono text-sm"
                value={wAmount}
                onChange={(e) => setWAmount(e.target.value)}
                placeholder="Amount (USD)"
              />
              <Input
                className="font-mono text-sm"
                value={wReason}
                onChange={(e) => {
                  setWReason(e.target.value);
                  setWStep("idle");
                }}
                placeholder="Reason (required)"
              />
            </div>
            {wStep === "confirm" ? (
              <p className="mt-2 text-sm font-semibold text-amber-200">
                Tap again to confirm withdrawing {centsToMoney(Math.round((parseFloat(wAmount) || 0) * 100))}
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="border-amber-800 text-amber-200"
                disabled={wBusy}
                onClick={() => void doWithdraw()}
              >
                {wStep === "confirm" ? "Confirm withdrawal" : "💸 Withdraw"}
              </Button>
              {wStep === "confirm" ? (
                <Button type="button" variant="secondary" onClick={() => setWStep("idle")}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm text-zinc-300">
          <thead className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">After</th>
              <th className="px-3 py-2">Job / reason</th>
            </tr>
          </thead>
          <tbody>
            {tx.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              tx.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/80">
                  <td className="px-3 py-2 font-mono text-xs uppercase">{t.type}</td>
                  <td
                    className={
                      t.type === "withdrawal" ? "px-3 py-2 text-amber-300" : "px-3 py-2 text-[#3dff7a]"
                    }
                  >
                    {t.type === "withdrawal" ? "−" : "+"}
                    {centsToMoney(Math.abs(t.amountCents ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{centsToMoney(t.balanceAfterCents ?? 0)}</td>
                  <td className="max-w-sm truncate px-3 py-2 text-xs" title={t.reason || t.serviceName || t.jobId}>
                    {t.type === "withdrawal" ? t.reason : `${t.serviceName || ""} ${t.jobId || ""}`.trim()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl border border-zinc-800 p-3"
      style={accent ? { borderColor: "rgba(61,255,122,0.3)", background: "rgba(7,20,13,0.6)" } : {}}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-lg ${accent ? "text-[#3dff7a]" : "text-zinc-200"}`}>{value}</div>
    </div>
  );
}
