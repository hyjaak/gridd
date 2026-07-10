"use client";

import { doc, collection, getFirestore } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { BITES_VIBE_PRESETS, displayVibeFromId } from "@/constants/bitesVibeTags";
import { useBitesCart } from "@/contexts/BitesCartContext";
import { useAuth } from "@/hooks/useAuth";
import { firebaseApp } from "@/lib/firebase";
import { requestDoorDashForBiteOrder, writeBiteOrderDoc } from "@/lib/bitesClientOrder";
import { estimateOrderEconomics } from "@/lib/bitesPricing";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const TIP_PCT = [0, 10, 15, 20] as const;

export default function BitesCheckoutPage() {
  const { loading, ok } = useRequireAuth(["customer", "ceo"]);
  const { user, profile } = useAuth();
  const cart = useBitesCart();
  const router = useRouter();
  const [tipPct, setTipPct] = useState<number>(15);
  const [share, setShare] = useState(true);
  const [preset, setPreset] = useState("postgame");
  const [custom, setCustom] = useState("");
  const [caption, setCaption] = useState("");
  const [addr, setAddr] = useState(profile?.homeAddress ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const subtotal = cart.subtotal;
  const deliveryFee = cart.deliveryFee;
  const serviceRate = 0.12;
  const econ = useMemo(
    () => estimateOrderEconomics(subtotal, deliveryFee, serviceRate, 0.15, 0, 0),
    [subtotal, deliveryFee],
  );
  const tipAmount = useMemo(
    () => Math.round((subtotal * (tipPct / 100) + Number.EPSILON) * 100) / 100,
    [subtotal, tipPct],
  );
  const total = useMemo(
    () => subtotal + deliveryFee + econ.serviceFee + tipAmount,
    [subtotal, deliveryFee, econ.serviceFee, tipAmount],
  );
  const vibeText = useMemo(
    () => (share ? displayVibeFromId(preset, custom) : ""),
    [share, preset, custom],
  );

  async function onConfirm() {
    if (!user || !cart.restaurant || !cart.restaurantId || cart.lines.length === 0) {
      setErr("Cart incomplete.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    const db = getFirestore(firebaseApp);
    const orderId = doc(collection(db, "biteOrders")).id;
    const z = (profile?.zip?.replace(/\D/g, "").slice(0, 5) || "00000");
    const geo = profile?.homeAddressGeo;
    try {
      const manual = cart.restaurant.manualFulfillment === true;

      await writeBiteOrderDoc({
        orderId,
        customerId: user.uid,
        customerName: profile?.name || user.displayName || "GRIDD",
        customerPhoto: profile?.photoUrl || user.photoURL || "",
        customerZip: z,
        restaurant: cart.restaurant,
        restaurantId: cart.restaurantId,
        items: cart.lines,
        subtotal,
        deliveryFee,
        serviceFee: econ.serviceFee,
        tip: tipAmount,
        total: total,
        isPublic: share,
        vibeTag: vibeText,
        caption: share ? caption : "",
        dropoffAddress: addr,
        dropoffLat: geo?.lat,
        dropoffLng: geo?.lng,
        manualFulfillment: manual,
      });

      if (!phone.trim()) {
        setErr(manual ? "Add a phone for coordination." : "Add a phone for the Dasher.");
        setSubmitting(false);
        return;
      }
      if (!addr.trim()) {
        setErr("Add your delivery address.");
        setSubmitting(false);
        return;
      }
      const r = cart.restaurant;
      if (!r?.address?.trim() || !r?.phone?.trim()) {
        setErr("Restaurant is missing address or phone — pick another spot.");
        setSubmitting(false);
        return;
      }

      if (!manual) {
        await requestDoorDashForBiteOrder({
          orderId,
          orderValueUsd: total,
          tipCents: Math.round(tipAmount * 100),
          pickup: {
            name: r.name,
            address: r.address,
            phone: r.phone,
            instructions: "GRIDD Bites order — " + (user.uid?.slice(0, 8) ?? ""),
          },
          dropoff: {
            name: profile?.name || "Customer",
            address: addr,
            phone: phone.replace(/\D/g, "").length >= 10 ? phone : "+1" + phone.replace(/\D/g, ""),
            instructions: "GRIDD Bites",
          },
        });
      }
      setCelebrate(true);
      cart.clearCart();
      setTimeout(() => {
        setCelebrate(false);
        router.replace(`/bites/track/${orderId}`);
      }, 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !ok) return <LoadingScreen />;

  return (
    <div className="min-h-[100dvh] bg-[#050505] pb-8 text-[var(--text)]">
      <header className="border-b border-white/10 px-2 py-2">
        <BackButton href="/bites" />
      </header>
      <div className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black text-white">Checkout</h1>
        {cart.lines.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Cart empty. <Link className="text-[#ff6b00] underline" href="/bites">Back to Bites</Link>
          </p>
        ) : null}

        <Card className="space-y-2 border border-white/10 bg-zinc-900/40 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Order</p>
          {cart.lines.map((l) => (
            <div key={l.itemId} className="flex justify-between text-sm">
              <span>
                {l.name} ×{l.quantity}
              </span>
              <span className="font-mono">${(l.unitPrice * l.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-white/10 pt-2 text-sm text-zinc-400">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Service (12%)</span>
              <span className="font-mono">${econ.serviceFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span className="font-mono">${deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tip</span>
              <span className="font-mono">${tipAmount.toFixed(2)}</span>
            </div>
            <div className="mt-2 flex justify-between text-lg font-bold text-white">
              <span>Total</span>
              <span className="font-mono text-[#00FF88]">${total.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        <div className="space-y-2">
          <label className="text-xs text-zinc-500">Delivery address</label>
          <Input value={addr} onChange={(e) => setAddr(e.target.value)} />
          <label className="text-xs text-zinc-500">Phone (DoorDash / Dasher)</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div>
          <p className="text-xs text-zinc-500">Tip</p>
          <div className="mt-2 flex gap-2">
            {TIP_PCT.map((p) => (
              <Button
                key={p}
                type="button"
                variant={tipPct === p ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setTipPct(p)}
              >
                {p}%
              </Button>
            ))}
          </div>
        </div>

        <Card className="space-y-3 border border-white/10 bg-zinc-900/40 p-4">
          <p className="text-sm font-bold">Share to feed?</p>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" variant={share ? "primary" : "secondary"} onClick={() => setShare(true)}>
              YES
            </Button>
            <Button
              type="button"
              className="flex-1"
              variant={!share ? "primary" : "secondary"}
              onClick={() => setShare(false)}
            >
              NO
            </Button>
          </div>
          {share ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {BITES_VIBE_PRESETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPreset(t.id)}
                    className={[
                      "rounded-full border px-2 py-1 text-[11px] font-bold",
                      preset === t.id ? "border-[#ff6b00] text-[#ff6b00]" : "border-white/20 text-zinc-500",
                    ].join(" ")}
                  >
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
              {preset === "custom" ? (
                <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="My tag" />
              ) : null}
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder='Caption: "bussin fr no cap"'
              />
            </>
          ) : null}
        </Card>

        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        <p className="text-center text-xs text-zinc-600">Delivered by DoorDash Dasher</p>
        <motion.div whileTap={{ scale: 0.97 }} className="w-full">
          <Button
            type="button"
            className="h-14 w-full bg-gradient-to-r from-[#00FF88] to-[#00cc6a] text-lg font-black text-black"
            disabled={submitting || cart.lines.length === 0}
            onClick={() => void onConfirm()}
          >
            {submitting ? "Placing…" : `GRIDD IT 🍗 $${total.toFixed(2)}`}
          </Button>
        </motion.div>
      </div>

      <AnimatePresence>
        {celebrate ? (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[#00FF88]/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-3xl border-4 border-white bg-[#0a0a0a] px-8 py-6 text-center shadow-2xl"
            >
              <p className="text-2xl font-black text-[#00FF88]">ORDER PLACED 🍗</p>
              <p className="mt-1 text-sm text-zinc-500">Rerouting to live tracking…</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
