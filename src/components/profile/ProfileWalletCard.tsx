"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { money } from "@/hooks/useGriddWalletData";
import { LoadGriddSheet } from "@/components/wallet/LoadGriddSheet";
import { SendGriddSheet } from "@/components/wallet/SendGriddSheet";
import { CashOutGriddSheet } from "@/components/wallet/CashOutGriddSheet";

const BORDER = "#1a1a1a";
const CARD = "#0a0a0a";

type Props = { balanceCents: number };

/**
 * Prominent wallet summary on Profile — buttons run the same flows as the full wallet page.
 * Tapping the card (outside buttons) opens `/wallet`.
 */
export function ProfileWalletCard({ balanceCents }: Props) {
  const router = useRouter();
  const [loadOpen, setLoadOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);

  return (
    <>
      <LoadGriddSheet open={loadOpen} onClose={() => setLoadOpen(false)} returnPath="/profile" walletUnlocked={true} />
      <SendGriddSheet open={sendOpen} onClose={() => setSendOpen(false)} balanceCents={balanceCents} />
      <CashOutGriddSheet
        open={cashOpen}
        onClose={() => setCashOpen(false)}
        balanceCents={balanceCents}
        returnPath="/profile"
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push("/wallet")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push("/wallet");
          }
        }}
        className="cursor-pointer rounded-2xl border p-4 text-left outline-none transition hover:border-[#00FF88]/40"
        style={{ background: CARD, borderColor: BORDER }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">💳 GRIDD Wallet</div>
            <div className="mt-1 font-mono text-3xl font-bold text-[#00FF88]">{money(balanceCents)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>+ 2% annual interest</span>
              <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-[#ff6b00]">Soon</span>
            </div>
          </div>
          <span className="text-xs text-zinc-600">Open →</span>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            className="min-h-[44px] flex-1 text-sm font-bold"
            onClick={(e) => {
              e.stopPropagation();
              setLoadOpen(true);
            }}
            style={{
              background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
              color: "#fff",
            }}
          >
            Load GRIDD ⚡
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] flex-1 text-sm"
            onClick={(e) => {
              e.stopPropagation();
              setSendOpen(true);
            }}
          >
            Send 📤
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] flex-1 text-sm"
            onClick={(e) => {
              e.stopPropagation();
              setCashOpen(true);
            }}
          >
            Cash out 💸
          </Button>
        </div>
      </div>
    </>
  );
}
