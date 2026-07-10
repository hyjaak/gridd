"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { WalletPrefs } from "@/hooks/useGriddWalletData";

type Props = {
  profileName?: string;
  prefs: WalletPrefs | null;
  walletUnlocked: boolean;
  demoWalletRestricted: boolean;
  onOpenLoad: () => void;
};

/** Virtual card + Pay With — same treatment as full driver wallet page. */
export function DriverWalletProfileExtras({
  profileName,
  prefs,
  walletUnlocked,
  demoWalletRestricted,
  onOpenLoad,
}: Props) {
  const [virtualCardTapToast, setVirtualCardTapToast] = useState(false);
  const canUse = walletUnlocked && !demoWalletRestricted;
  const last4 = prefs?.virtualCardLast4 ?? "4242";
  const holder = prefs?.cardholderName ?? profileName ?? "Cardholder";
  const expiry = prefs?.cardExpiry ?? "12/28";
  const cvv = prefs?.cardCvv ?? "•••";

  return (
    <>
      {virtualCardTapToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-28 left-1/2 z-[100] w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#141414] px-4 py-3 text-center text-sm font-medium text-[var(--text)] shadow-xl"
        >
          Virtual card launching soon 🔥
        </div>
      ) : null}

      <section className="mt-8">
        <div className="text-sm font-semibold text-zinc-200">Virtual Card</div>
        <div className="relative mt-3 w-full">
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
          <div className="pointer-events-none w-full opacity-[0.72] grayscale" style={{ perspective: "1000px" }}>
            <div className="relative min-h-[200px] w-full transition-transform duration-500" style={{ transformStyle: "preserve-3d" }}>
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

      <section className="mt-8">
        <div className="text-sm font-semibold text-zinc-200">Pay With</div>
        <div className="mt-3 space-y-2">
          <Button
            type="button"
            variant="secondary"
            className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4"
            disabled={!canUse}
            onClick={() => canUse && onOpenLoad()}
          >
            <span className="text-sm font-medium text-[var(--text)]">🍎 Apple Pay</span>
            <span className="text-xs font-semibold text-[#ff6b00]">Add</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4"
            disabled={!canUse}
            onClick={() => canUse && onOpenLoad()}
          >
            <span className="text-sm font-medium text-[var(--text)]">🤖 Google Pay</span>
            <span className="text-xs font-semibold text-[#ff6b00]">Add</span>
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Card, Apple Pay, and Google Pay are added through Stripe when you complete the payment sheet.
        </p>
      </section>
    </>
  );
}
