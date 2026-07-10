"use client";

import { AnimatePresence, motion } from "framer-motion";
import { doc, getFirestore, updateDoc, Timestamp } from "firebase/firestore";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { firebaseApp } from "@/lib/firebase";

type Props = {
  orderId: string;
  restaurantName: string;
};

function StarsRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold text-zinc-300">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="text-2xl leading-none transition"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            {n <= value ? "⭐" : "☆"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BiteOrderRatingSheet({ orderId, restaurantName }: Props) {
  const [restaurant, setRestaurant] = useState(0);
  const [dasher, setDasher] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useCallback(
    async (mode: "full" | "skip") => {
      if (!firebaseApp) {
        setErr("App not ready");
        return;
      }
      setSaving(true);
      setErr(null);
      try {
        const db = getFirestore(firebaseApp);
        const ref = doc(db, "biteOrders", orderId);
        if (mode === "skip") {
          await updateDoc(ref, { awaitingRating: false });
        } else {
          if (restaurant < 1 || restaurant > 5 || dasher < 1 || dasher > 5) {
            setErr("Tap stars for both — quick vibes.");
            setSaving(false);
            return;
          }
          await updateDoc(ref, {
            awaitingRating: false,
            restaurantRating: restaurant,
            dasherRating: dasher,
            ...(note.trim() ? { ratingNote: note.trim() } : {}),
            ratedAt: Timestamp.now(),
            lastUpdated: Timestamp.now(),
          });
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn’t save");
      } finally {
        setSaving(false);
      }
    },
    [orderId, restaurant, dasher, note],
  );

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        aria-hidden
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[min(90dvh,640px)] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0a0a0a] p-5 pb-8 shadow-2xl"
        initial={{ y: 120, opacity: 0.9 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-zinc-700" />
        <h2 className="mt-3 font-[family-name:var(--font-syne)] text-2xl font-black text-white">How was it? 🍗</h2>
        <p className="text-sm text-zinc-500">Rate {restaurantName} and your Dasher</p>

        <div className="mt-4">
          <StarsRow label={restaurantName} value={restaurant} onChange={setRestaurant} />
          <StarsRow label="Your Dasher" value={dasher} onChange={setDasher} />
        </div>

        <label className="block text-sm font-medium text-zinc-400">
          Shout (optional)
          <textarea
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            rows={2}
            maxLength={200}
            placeholder="Fire meal 💯"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            className="w-full text-base font-bold"
            disabled={saving}
            onClick={() => void save("full")}
          >
            {saving ? "Saving…" : "Submit · GRIDD IT"}
          </Button>
          <Button type="button" variant="secondary" className="w-full" disabled={saving} onClick={() => void save("skip")}>
            Not now
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
