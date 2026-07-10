"use client";

import { motion, useAnimation } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BiteOrder } from "@/types/bites";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { toggleGridditBiteOrder } from "@/lib/bitesGriddit";
import { timeAgoShort } from "@/lib/bitesTime";

type Props = {
  order: BiteOrder & { id: string };
  isNew?: boolean;
  onOrderSame: (o: BiteOrder & { id: string }) => void;
};

const REST_EMOJIS = ["🍜", "🍔", "🌮", "🍣", "🥡", "🍕", "🥗", "🧋"];

function restEmoji(s: string) {
  const i = s.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % REST_EMOJIS.length;
  return REST_EMOJIS[i] ?? "🍴";
}

export function BitePoppinCard({ order, isNew, onOrderSame }: Props) {
  const { user } = useAuth();
  const [burst, setBurst] = useState(false);
  const [gr, setGr] = useState(order.gridditCount ?? 0);
  const [did, setDid] = useState(user?.uid ? (order.gridditUserIds ?? []).includes(user.uid) : false);
  const gridditCtrl = useAnimation();

  useEffect(() => {
    setGr(order.gridditCount ?? 0);
    setDid(user?.uid ? (order.gridditUserIds ?? []).includes(user.uid) : false);
  }, [order.gridditCount, order.gridditUserIds, user?.uid]);

  const onGriddit = useCallback(async () => {
    try {
      await toggleGridditBiteOrder(order.id);
      setDid((d) => !d);
      setGr((g) => (did ? g - 1 : g + 1));
      setBurst(true);
      void gridditCtrl.start({ scale: [1, 1.4, 0.9, 1], transition: { duration: 0.45, ease: "easeOut" } });
      setTimeout(() => setBurst(false), 550);
    } catch {
      /* toast in parent if needed */
    }
  }, [did, gridditCtrl, order.id]);

  const when = timeAgoShort(order.createdAt as { toDate?: () => Date } | Date);
  const re = restEmoji(order.restaurantName);
  const vibe = order.vibeTag?.trim();

  return (
    <div className="w-full">
      <motion.div
        animate={
          isNew
            ? {
                boxShadow: [
                  "0 0 0 0 rgba(0,255,136,0)",
                  "0 0 0 10px rgba(0,255,136,0.25)",
                  "0 0 0 0 rgba(0,255,136,0)",
                ],
                borderColor: ["rgba(255,255,255,0.06)", "rgba(0,255,136,0.5)", "rgba(255,255,255,0.06)"],
              }
            : undefined
        }
        transition={{ duration: 1.1 }}
        className="overflow-hidden rounded-[24px] border"
        style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderColor: "rgba(255,255,255,0.06)",
          boxShadow: burst ? "0 0 40px rgba(255,107,0,0.28)" : undefined,
        }}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-2xl shadow-inner">
              {re}
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-sm font-bold text-white">
                {order.customerName}
                <span className="block text-[11px] font-medium text-zinc-500 sm:inline sm:before:content-['·_']">
                  {when}
                </span>
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white/80">{order.restaurantName}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {order.items.map((i) => (
              <span
                key={i.name + i.quantity}
                className="inline-flex rounded-full bg-[#ff6b00]/20 px-2.5 py-1 text-[11px] font-bold text-[#ff6b00]"
              >
                {i.name}×{i.quantity}
              </span>
            ))}
          </div>

          {vibe ? (
            <div className="mt-3 inline-flex rounded-lg bg-gradient-to-r from-[#ff6b00] to-[#ff9500] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-black">
              {vibe}
            </div>
          ) : null}

          {order.caption ? <p className="mt-3 text-sm italic text-zinc-400">&ldquo;{order.caption}&rdquo;</p> : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <motion.button
                type="button"
                onClick={() => void onGriddit()}
                animate={gridditCtrl}
                className={[
                  "rounded-full px-2.5 py-1.5 text-xs font-extrabold transition-colors",
                  burst ? "bg-[#ff6b00] text-black" : "bg-white/5 text-zinc-200 hover:bg-white/10",
                ].join(" ")}
              >
                ‼️ GRIDD IT {gr}
              </motion.button>
              <span className="rounded-full bg-white/5 px-2.5 py-1.5 text-xs font-bold">❤️ {order.likeCount ?? 0}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-9 bg-gradient-to-r from-[#ff6b00] to-[#ff9500] text-xs font-extrabold text-black"
                onClick={() => onOrderSame(order)}
              >
                Order same →
              </Button>
              <Button asChild variant="secondary" className="h-9 border border-white/10 bg-transparent text-xs text-zinc-300">
                <Link href={`/bites/restaurant/${order.restaurantId}`}>+ Add</Link>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
