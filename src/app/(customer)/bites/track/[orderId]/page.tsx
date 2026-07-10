"use client";

import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { doc, onSnapshot, getFirestore, Timestamp } from "firebase/firestore";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { DEMO_RESTAURANTS } from "@/lib/bitesDemoRestaurants";
import { BiteOrderRatingSheet } from "@/components/bites/BiteOrderRatingSheet";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { BiteOrder, BiteOrderStatus } from "@/types/bites";

const mapContainer = { width: "100%", height: "min(45vh, 400px)" };

const STEPS: { id: BiteOrderStatus; label: string }[] = [
  { id: "pending", label: "Order placed" },
  { id: "dasher_assigned", label: "Dasher assigned" },
  { id: "picked_up", label: "Picked up" },
  { id: "en_route", label: "On the way" },
  { id: "delivered", label: "Delivered" },
];

function stepIndex(s: string) {
  if (s === "delivered") return 4;
  if (s === "almost_there" || s === "en_route" || s === "picked_up") return 3;
  if (s === "arrived_at_restaurant") return 2;
  if (s === "dasher_assigned" || s === "doordash_created" || s === "confirmed") return 1;
  return 0;
}

export default function BitesTrackPage() {
  const { loading, ok } = useRequireAuth(["customer", "ceo"]);
  const { user } = useAuth();
  const params = useParams();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const [order, setOrder] = useState<(BiteOrder & { id: string }) | null>(null);
  const [orderResolved, setOrderResolved] = useState(false);
  const [orderMissing, setOrderMissing] = useState(false);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const router = useRouter();

  const { isLoaded } = useJsApiLoader({
    id: "bites-map",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  useEffect(() => {
    if (!orderId) return;
    if (!firebaseApp) {
      setOrderResolved(true);
      setOrderMissing(true);
      return;
    }
    const db = getFirestore(firebaseApp);
    return onSnapshot(
      doc(db, "biteOrders", orderId),
      (s) => {
        setOrderResolved(true);
        if (!s.exists()) {
          setOrderMissing(true);
          setOrder(null);
          return;
        }
        setOrderMissing(false);
        const d = s.data() as BiteOrder;
        setOrder({ id: s.id, ...d });
        const est = d.estimatedDelivery;
        if (est instanceof Timestamp) {
          const m = Math.max(0, Math.round((est.toMillis() - Date.now()) / 60000));
          setEtaMin(m);
        }
      },
      () => {
        setOrderResolved(true);
        setOrder(null);
        setOrderMissing(true);
      },
    );
  }, [orderId]);

  useEffect(() => {
    if (!orderId || !order) return;
    if (order.status === "delivered" || order.status === "cancelled" || order.status === "failed") return;
    const poll = async () => {
      try {
        const token = await firebaseAuth?.currentUser?.getIdToken();
        if (!token) return;
        const r = await fetch(`/api/bites/orders/${orderId}/dd`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await r.json()) as {
          ok?: boolean;
          delivery?: { dasher?: { location?: { lat?: number; lng?: number } } };
        };
        if (!j.ok || !j.delivery?.dasher?.location) return;
        const loc = j.delivery.dasher.location;
        const la = typeof loc.lat === "number" ? loc.lat : Number(loc.lat);
        const ln = typeof loc.lng === "number" ? loc.lng : Number(loc.lng);
        if (Number.isFinite(la) && Number.isFinite(ln)) {
          setOrder((prev) => (prev ? { ...prev, dasherLocation: { lat: la, lng: ln } } : prev));
        }
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(() => void poll(), 30000);
    void poll();
    return () => clearInterval(id);
  }, [orderId, order?.status]);

  const center = useMemo(() => {
    const demo = order ? DEMO_RESTAURANTS[order.restaurantId] : null;
    const lat = order?.dropoffLat ?? order?.dasherLocation?.lat ?? demo?.restaurant.lat ?? 33.88;
    const lng = order?.dropoffLng ?? order?.dasherLocation?.lng ?? demo?.restaurant.lng ?? -84.46;
    return { lat, lng };
  }, [order]);

  const linePath = useMemo(() => {
    if (!order) return [];
    const demo = DEMO_RESTAURANTS[order.restaurantId];
    if (!demo) return [];
    const a = { lat: demo.restaurant.lat, lng: demo.restaurant.lng };
    const b = order.dasherLocation ?? (order.dropoffLat ? { lat: order.dropoffLat, lng: order.dropoffLng ?? a.lng } : a);
    return [a, b];
  }, [order]);

  useEffect(() => {
    if (!order || order.status === "delivered" || !order.estimatedDelivery) return;
    const t = setInterval(() => {
      const est = order.estimatedDelivery;
      if (est instanceof Timestamp) {
        setEtaMin(Math.max(0, Math.round((est.toMillis() - Date.now()) / 60000)));
      }
    }, 60000);
    return () => clearInterval(t);
  }, [order]);

  if (loading || !ok) return <LoadingScreen />;
  if (order && order.customerId !== user?.uid) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        Not your order. <Link href="/bites" className="text-[#ff6b00]">Bites</Link>
      </div>
    );
  }

  if (!orderResolved) {
    return <LoadingScreen />;
  }

  if (orderMissing || !order) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#050505] p-6 text-center text-sm text-zinc-500">
        <p>We couldn’t find that order.</p>
        <Button type="button" onClick={() => router.push("/bites")}>
          Back to Bites
        </Button>
      </div>
    );
  }

  const st = order.status;
  const si = stepIndex(st);
  const deliveredPulse = st === "delivered";
  const showRating = deliveredPulse && order.awaitingRating;

  return (
    <div
      className="min-h-[100dvh] text-white"
      style={{ background: deliveredPulse ? "radial-gradient(circle at 50% 20%, #002210, #050505)" : "#050505" }}
    >
      {showRating ? <BiteOrderRatingSheet orderId={order.id} restaurantName={order.restaurantName} /> : null}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/bites")} className="text-zinc-400">
          ← Bites
        </Button>
        {deliveredPulse ? (
          <motion.p
            className="text-sm font-bold text-[#00FF88]"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: 5 }}
          >
            DELIVERED
          </motion.p>
        ) : null}
      </div>

      <div className="p-4">
        <h1 className="text-xl font-black">Track order</h1>
        <p className="text-sm text-zinc-500">#{order.id.slice(0, 8)}</p>
        {etaMin !== null ? (
          <p className="mt-2 text-2xl font-bold text-[#ff6b00]">
            {st === "delivered" ? "Enjoy 🍗" : `~${etaMin} min · ETA`}
          </p>
        ) : null}

        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-3">
            {order.dasherPhoto ? (
              <img
                src={order.dasherPhoto}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-2xl">🥷</div>
            )}
            <div>
              <p className="text-lg font-bold">{order.dasherName ?? "Dasher on the way"}</p>
              {order.dasherPhone ? <p className="text-sm text-zinc-500">{order.dasherPhone}</p> : null}
              {order.dasherCar ? <p className="text-xs text-zinc-600">{order.dasherCar}</p> : null}
            </div>
          </div>
        </div>
      </div>

      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={mapContainer}
          center={center}
          zoom={12}
          options={{ styles: [], disableDefaultUI: true }}
        >
          {DEMO_RESTAURANTS[order.restaurantId] ? (
            <Marker
              position={{
                lat: DEMO_RESTAURANTS[order.restaurantId]!.restaurant.lat,
                lng: DEMO_RESTAURANTS[order.restaurantId]!.restaurant.lng,
              }}
              label="R"
            />
          ) : null}
          {order.dasherLocation ? (
            <Marker position={order.dasherLocation} label="D" />
          ) : null}
          {order.dropoffLat && order.dropoffLng ? <Marker position={{ lat: order.dropoffLat, lng: order.dropoffLng }} label="U" /> : null}
          {linePath.length > 1 ? <Polyline path={linePath} options={{ strokeColor: "#00FF88", strokeOpacity: 0.8, strokeWeight: 3 }} /> : null}
        </GoogleMap>
      ) : (
        <div className="flex h-48 items-center justify-center text-zinc-600">Set NEXT_PUBLIC_GOOGLE_MAPS_KEY for map</div>
      )}

      <div className="space-y-2 px-4 py-3">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2 text-sm">
            <span className="text-lg">{i <= si ? "●" : "○"}</span>
            <span className={i <= si ? "text-[#00FF88]" : "text-zinc-600"}>{step.label}</span>
          </div>
        ))}
      </div>

      {order.dasherPhone ? (
        <div className="px-4">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              const n = order.dasherPhone!.replace(/\D/g, "");
              window.location.href = `sms:${n}`;
            }}
          >
            Message Dasher
          </Button>
        </div>
      ) : null}
    </div>
  );
}
