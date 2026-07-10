"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { money, type GriddWalletData } from "@/hooks/useGriddWalletData";
import { LoadGriddSheet } from "@/components/wallet/LoadGriddSheet";
import { SendGriddSheet } from "@/components/wallet/SendGriddSheet";
import { CashOutGriddSheet } from "@/components/wallet/CashOutGriddSheet";

export type GriddWalletBodyProps = GriddWalletData & {
  walletUnlocked: boolean;
  /** e.g. drivers: `/driver/earnings` for bank / payouts */
  cashOutHref?: string;
  /** Path for Stripe `return_url` after wallet load (e.g. `/wallet`, `/driver/wallet`) */
  loadReturnPath?: string;
  /** Driver wallet screen: Pay With row + virtual card badge/toast treatment */
  driverWallet?: boolean;
  /** Demo driver — show balance but lock load / send / cash out until fully approved */
  demoWalletRestricted?: boolean;
};

export function GriddWalletBody({
  balanceCents,
  points,
  tierName,
  nextTier,
  progressToNext,
  tx,
  prefs,
  flipped: _flipped,
  setFlipped: _setFlipped,
  toggleWalletFlag: _toggleWalletFlag,
  profileName,
  walletUnlocked,
  cashOutHref,
  loadReturnPath = "/wallet",
  driverWallet = false,
  demoWalletRestricted = false,
}: GriddWalletBodyProps) {
  const canUseStripeWallet = walletUnlocked && !demoWalletRestricted;
  const [loadOpen, setLoadOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [virtualCardTapToast, setVirtualCardTapToast] = useState(false);
  const last4 = prefs?.virtualCardLast4 ?? "4242";
  const holder = prefs?.cardholderName ?? profileName ?? "Cardholder";
  const expiry = prefs?.cardExpiry ?? "12/28";
  const cvv = prefs?.cardCvv ?? "•••";

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-8">
      <LoadGriddSheet
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        returnPath={loadReturnPath}
        walletUnlocked={canUseStripeWallet}
      />
      <SendGriddSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        balanceCents={balanceCents}
      />
      <CashOutGriddSheet
        open={cashOutOpen}
        onClose={() => setCashOutOpen(false)}
        balanceCents={balanceCents}
        returnPath={loadReturnPath}
      />
      {!walletUnlocked ? (
        <div className="mb-6 rounded-xl border border-amber-500/35 bg-amber-950/35 px-4 py-3 text-center">
          <p className="text-sm font-medium text-amber-100">
            💳 Wallet unlocks once your account is approved by GRIDD
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            Balance and history are visible; Load GRIDD, send, and cash out unlock when approved.
          </p>
        </div>
      ) : demoWalletRestricted ? (
        <div className="mb-6 rounded-xl border border-[#ff6b00]/35 bg-[#2a1500]/50 px-4 py-3 text-center">
          <p className="text-sm font-medium text-orange-100">
            💰 Unlock {money(balanceCents)} — Submit docs to cash out and transfer. Your trial earnings are real.
          </p>
        </div>
      ) : null}

      {virtualCardTapToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-28 left-1/2 z-[100] w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#141414] px-4 py-3 text-center text-sm font-medium text-[var(--text)] shadow-xl"
        >
          Virtual card launching soon 🔥
        </div>
      ) : null}

      <div>
        <section className="text-center">
          <div className="text-5xl font-bold tracking-tight text-[#00FF88]">{money(balanceCents)}</div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--sub)]">
            <span>+ 2% annual interest</span>
            <span className="rounded-full bg-black px-2.5 py-0.5 text-[10px] font-semibold text-[#ff6b00]">
              Coming soon
            </span>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                if (!walletUnlocked) return;
                if (demoWalletRestricted) {
                  window.alert("Send is unavailable in demo mode. Submit documents to go fully live.");
                  return;
                }
                setSendOpen(true);
              }}
              disabled={!walletUnlocked || demoWalletRestricted}
            >
              Send 📤
            </Button>
            {demoWalletRestricted && walletUnlocked ? (
              <Button variant="secondary" type="button" disabled className="max-w-[min(100%,20rem)] text-left">
                💰 Submit documents to unlock your {money(balanceCents)} earnings
              </Button>
            ) : cashOutHref && walletUnlocked ? (
              <Button variant="secondary" asChild href={cashOutHref}>
                Cash Out 💸
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!walletUnlocked) return;
                  setCashOutOpen(true);
                }}
                disabled={!walletUnlocked}
              >
                Cash Out 💸
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => canUseStripeWallet && setLoadOpen(true)}
            disabled={!canUseStripeWallet}
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
          <div className="relative mt-3 w-full max-w-md">
            <span
              className="pointer-events-none"
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 30,
                background: "rgba(0,0,0,0.6)",
                color: "#ff6b00",
                fontSize: 10,
                fontWeight: 800,
                padding: "4px 10px",
                borderRadius: 20,
                border: "1px solid #ff6b00",
              }}
            >
              Coming Soon ✨
            </span>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Virtual card launching soon"
              className="absolute inset-0 z-20 cursor-default rounded-2xl border-0 bg-transparent p-0"
              onClick={(e) => {
                e.preventDefault();
                setVirtualCardTapToast(true);
                window.setTimeout(() => setVirtualCardTapToast(false), 3200);
              }}
            />
            <div
              className="pointer-events-none w-full perspective-[1000px] opacity-[0.72] grayscale"
              style={{ perspective: "1000px" }}
            >
            <div
              className="relative min-h-[200px] w-full transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: "rotateY(0deg)",
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
                <div className="mt-6 text-xs text-white/40">Launching soon</div>
              </div>
            </div>
            </div>
          </div>
        </section>

        {driverWallet ? (
          <section className="mt-10">
            <div className="text-sm font-semibold text-[var(--text)]">Pay With</div>
            <div className="mt-3 max-w-md space-y-2">
              <Button
                type="button"
                variant="secondary"
                className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4"
                disabled={!canUseStripeWallet}
                onClick={() => canUseStripeWallet && setLoadOpen(true)}
              >
                <span className="text-sm font-medium text-[var(--text)]">🍎 Apple Pay</span>
                <span className="text-xs font-semibold text-[#ff6b00]">Add</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4"
                disabled={!canUseStripeWallet}
                onClick={() => canUseStripeWallet && setLoadOpen(true)}
              >
                <span className="text-sm font-medium text-[var(--text)]">🤖 Google Pay</span>
                <span className="text-xs font-semibold text-[#ff6b00]">Add</span>
              </Button>
            </div>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--sub)]">
              Card, Apple Pay, Google Pay, and bank (Financial Connections) are added through Stripe when you complete
              the payment sheet.
            </p>
          </section>
        ) : (
          <section className="mt-10">
            <div className="text-sm font-semibold text-[var(--text)]">Wallets &amp; bank</div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--sub)]">
              Debit/credit card, Apple Pay, Google Pay, and US bank debits (where your bank and Stripe support them)
              are handled in one Stripe Payment sheet when you tap <span className="text-[var(--text)]">Load GRIDD</span>
              — no separate crypto, wire, or third-party apps.
            </p>
          </section>
        )}

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
