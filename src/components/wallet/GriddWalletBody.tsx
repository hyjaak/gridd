"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { money, type GriddWalletData } from "@/hooks/useGriddWalletData";

export type GriddWalletBodyProps = GriddWalletData & {
  walletUnlocked: boolean;
  /** e.g. drivers: `/driver/earnings` for bank / payouts */
  cashOutHref?: string;
};

export function GriddWalletBody({
  balanceCents,
  points,
  tierName,
  nextTier,
  progressToNext,
  tx,
  prefs,
  flipped,
  setFlipped,
  toggleWalletFlag,
  profileName,
  walletUnlocked,
  cashOutHref,
}: GriddWalletBodyProps) {
  const last4 = prefs?.virtualCardLast4 ?? "4242";
  const holder = prefs?.cardholderName ?? profileName ?? "Cardholder";
  const expiry = prefs?.cardExpiry ?? "12/28";
  const cvv = prefs?.cardCvv ?? "•••";

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-8">
      {!walletUnlocked ? (
        <div className="mb-6 rounded-xl border border-amber-500/35 bg-amber-950/35 px-4 py-3 text-center">
          <p className="text-sm font-medium text-amber-100">
            💳 Wallet unlocks once your account is approved by GRIDD
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            Balance and history are visible; Load GRIDD, send, and cash out unlock when approved.
          </p>
        </div>
      ) : null}

      <div>
        <section className="text-center">
          <div className="text-5xl font-bold tracking-tight text-[#00FF88]">{money(balanceCents)}</div>
          <div className="mt-2 text-sm text-[var(--sub)]">+ 2% annual interest</div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                if (!walletUnlocked) return;
                window.alert("Send to neighbors and contacts — coming in a future update.");
              }}
              disabled={!walletUnlocked}
            >
              Send 📤
            </Button>
            {cashOutHref && walletUnlocked ? (
              <Button variant="secondary" asChild href={cashOutHref}>
                Cash Out 💸
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!walletUnlocked) return;
                  window.alert("Cash out and bank settings — use Wallet in your profile menu.");
                }}
                disabled={!walletUnlocked}
              >
                Cash Out 💸
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!walletUnlocked) return;
              window.alert("Add funds to your GRIDD balance — payment integration coming soon.");
            }}
            disabled={!walletUnlocked}
            className="mx-auto mt-4 flex w-full max-w-md min-h-[52px] items-center justify-center gap-2 rounded-[22px] px-5 py-3.5 text-base font-bold tracking-tight text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            style={{
              fontFamily: "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
              background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
              boxShadow: "0 8px 24px rgba(255, 107, 0, 0.35)",
            }}
          >
            <span className="text-xl leading-none" aria-hidden>
              ⚡
            </span>
            Load GRIDD
          </button>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Virtual Card</div>
          <button
            type="button"
            onClick={() => walletUnlocked && setFlipped((f) => !f)}
            disabled={!walletUnlocked}
            className="mt-3 w-full max-w-md perspective-[1000px] text-left outline-none disabled:opacity-50"
            style={{ perspective: "1000px" }}
          >
            <div
              className="relative min-h-[200px] w-full transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              <div
                className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-[#FF6B00] via-[#1a0a00] to-black p-6 text-white shadow-xl"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="text-xs font-semibold tracking-widest text-white/80">GRIDD</div>
                <div className="mt-10 font-mono text-lg tracking-[0.2em]">
                  4747 •••• •••• {last4}
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase text-white/60">Cardholder</div>
                    <div className="text-sm font-medium">{holder}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-white/60">Expires</div>
                    <div className="text-sm font-medium">{expiry}</div>
                  </div>
                  <div className="rounded bg-white px-2 py-1 text-xs font-black italic text-black">VISA</div>
                </div>
              </div>
              <div
                className="absolute inset-0 rounded-2xl border border-white/10 bg-gradient-to-br from-black via-[#0a0a0a] to-[#1a1a1a] p-6 shadow-xl"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <div className="mt-8 h-10 w-full bg-black/80" />
                <div className="mt-4 flex justify-end">
                  <div className="rounded bg-white/90 px-4 py-2 font-mono text-lg text-black">{cvv}</div>
                </div>
                <div className="mt-6 text-xs text-white/60">Tap to flip</div>
              </div>
            </div>
          </button>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Digital Wallets</div>
          <div className="mt-3 space-y-3">
            {(
              [
                { key: "applePayAdded" as const, label: "Apple Pay 🍎" },
                { key: "googlePayAdded" as const, label: "Google Pay 🌐" },
                { key: "samsungPayAdded" as const, label: "Samsung Pay 📱" },
              ] as const
            ).map((w) => (
              <Card key={w.key} className="flex items-center justify-between p-4">
                <span className="text-sm text-[var(--text)]">{w.label}</span>
                {prefs?.[w.key] ? (
                  <span className="text-sm text-[#00FF88]">Ready ✓</span>
                ) : (
                  <Button
                    variant="secondary"
                    className="text-xs"
                    disabled={!walletUnlocked}
                    onClick={() => walletUnlocked && void toggleWalletFlag(w.key)}
                  >
                    Add
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Transaction History</div>
          <div className="mt-3 space-y-2">
            {tx.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-[var(--sub)]">No wallet transactions yet.</p>
              </Card>
            ) : (
              tx.map((row) => (
                <Card key={row.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{row.icon ?? "💳"}</span>
                    <div>
                      <div className="text-sm font-medium text-[var(--text)]">{row.label}</div>
                      <div className="text-xs text-[var(--sub)]">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>
                  <div
                    className={[
                      "text-sm font-semibold tabular-nums",
                      row.kind === "credit" ? "text-[#00FF88]" : "text-[var(--text)]",
                    ].join(" ")}
                  >
                    {row.kind === "credit" ? "+" : "−"}
                    {money(Math.abs(row.amountCents))}
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="mt-10">
          <div className="text-sm font-semibold text-[var(--text)]">Ditch Points</div>
          <Card className="mt-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-[var(--sub)]">Balance</div>
                <div className="text-2xl font-semibold text-[#FFB800]">{points.toLocaleString()} pts</div>
              </div>
              <span className="rounded-full border border-[#FFB800] px-3 py-1 text-xs font-semibold text-[#FFB800]">
                {tierName}
              </span>
            </div>
            {nextTier ? (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[var(--sub)]">
                  <span>Progress to {nextTier.name}</span>
                  <span>
                    {points} / {nextTier.min}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#00FF88] transition-all"
                    style={{ width: `${progressToNext}%` }}
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-6 space-y-2 text-sm text-[var(--sub)]">
              <div className="font-medium text-[var(--text)]">Rewards ladder</div>
              <div>500 pts → $5 off your next haul</div>
              <div>1000 pts → $10 off</div>
              <div>2000 pts → free standard haul</div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
