"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { money } from "@/hooks/useGriddWalletData";
import { SendGriddSheet } from "@/components/wallet/SendGriddSheet";

const BORDER = "#1a1a1a";
const CARD = "#0a0a0a";

type Props = {
  balanceCents: number;
  walletUnlocked: boolean;
  demoWalletRestricted: boolean;
  onOpenLoad: () => void;
};

/**
 * Prominent wallet on driver profile — Load/Send/Cash out; full wallet lives on profile.
 */
export function DriverProfileWalletCard({ balanceCents, walletUnlocked, demoWalletRestricted, onOpenLoad }: Props) {
  const [sendOpen, setSendOpen] = useState(false);
  const canUse = walletUnlocked && !demoWalletRestricted;

  return (
    <>
      <SendGriddSheet open={sendOpen} onClose={() => setSendOpen(false)} balanceCents={balanceCents} />

      <div
        className="rounded-2xl border p-5 text-left transition hover:border-[#00FF88]/40"
        style={{ background: CARD, borderColor: BORDER }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">💳 GRIDD Wallet</div>
            <div className="mt-1 font-mono text-3xl font-bold text-[#00FF88]">{money(balanceCents)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>+ 2% annual interest</span>
              <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-[#ff6b00]">
                Coming soon
              </span>
            </div>
            {!walletUnlocked ? (
              <p className="mt-2 text-xs text-amber-200/90">Wallet unlocks when your account is approved.</p>
            ) : demoWalletRestricted ? (
              <p className="mt-2 text-xs text-orange-200/90">Submit documents to load, send, and cash out.</p>
            ) : null}
          </div>
          <span className="text-xs text-zinc-600">On your profile</span>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            className="min-h-[44px] flex-1 text-sm font-bold"
            disabled={!canUse}
            onClick={(e) => {
              e.stopPropagation();
              if (canUse) onOpenLoad();
            }}
            style={{
              background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
              color: "#fff",
            }}
          >
            ⚡ Load GRIDD
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] flex-1 text-sm"
            disabled={!canUse}
            onClick={(e) => {
              e.stopPropagation();
              if (canUse) setSendOpen(true);
            }}
          >
            Send
          </Button>
          <Button type="button" variant="secondary" className="min-h-[44px] flex-1 text-sm" asChild>
            <Link href="/driver/earnings" onClick={(e) => e.stopPropagation()}>
              Cash Out
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
