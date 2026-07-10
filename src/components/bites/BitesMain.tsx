"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { BITES_VIBE_PRESETS } from "@/constants/bitesVibeTags";
import { useBitesCart } from "@/contexts/BitesCartContext";
import { useAuth } from "@/hooks/useAuth";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { doorDashLinkedToBiteRestaurant } from "@/lib/bitesDoorDashUi";
import type { DoorDashLinkedBusiness } from "@/types/bitesDoordash";
import { manualRestaurantDocToLinkedBusiness } from "@/lib/bitesManualRestaurant";
import { biteTrendingScore } from "@/lib/bitesTrending";
import { BitePoppinCard } from "./BitePoppinCard";
import type { BiteFeedFilter, BiteOrder } from "@/types/bites";

const FEED_FILTERS: { id: BiteFeedFilter; label: string }[] = [
  { id: "trending", label: "🔥 Trending" },
  { id: "friends", label: "👥 Friends" },
  { id: "late", label: "🌙 Late Night" },
  { id: "healthy", label: "💪 Healthy" },
  { id: "under10", label: "💸 Under $10" },
  { id: "mostGriddit", label: "🏆 Most GRIDD'd" },
];

function useZipCount(zip: string | undefined) {
  const [n, setN] = useState(0);
  const dk = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  useEffect(() => {
    if (!zip || !firebaseApp) {
      setN(0);
      return;
    }
    const db = getFirestore(firebaseApp);
    const qy = query(
      collection(db, "biteOrders"),
      where("customerZip", "==", zip),
      where("dayKey", "==", dk),
    );
    return onSnapshot(
      qy,
      (s) => setN(s.size),
      () => setN(0),
    );
  }, [zip, dk]);
  return n;
}

function filterFeed(orders: (BiteOrder & { id: string })[], f: BiteFeedFilter, userZip: string | undefined) {
  const z = (o: BiteOrder & { id: string }) => {
    if (userZip && o.customerZip && o.customerZip !== userZip) return false;
    return true;
  };
  let list = orders.filter(z);
  const hour = new Date().getHours();
  if (f === "late") list = list.filter(() => hour >= 22 || hour < 4);
  if (f === "under10") list = list.filter((o) => o.total < 10);
  if (f === "healthy")
    list = list.filter(
      (o) =>
        o.vibeTag?.toLowerCase().includes("healthy") ||
        o.items.some((i) => i.name.toLowerCase().includes("salad")),
    );
  if (f === "mostGriddit") list = [...list].sort((a, b) => (b.gridditCount ?? 0) - (a.gridditCount ?? 0));
  if (f === "trending" || f === "friends") {
    list = [...list].sort(
      (a, b) =>
        biteTrendingScore({
          orderCount: 1,
          gridditCount: b.gridditCount ?? 0,
          likeCount: b.likeCount ?? 0,
          createdAtMs: (b.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0,
        }) -
        biteTrendingScore({
          orderCount: 1,
          gridditCount: a.gridditCount ?? 0,
          likeCount: a.likeCount ?? 0,
          createdAtMs: (a.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0,
        }),
    );
  }
  if (f === "friends") list = list.slice(0, 8);
  return list;
}

export function BitesMain() {
  const router = useRouter();
  const { profile } = useAuth();
  const cart = useBitesCart();
  const zip = profile?.zip?.replace(/\D/g, "").slice(0, 5) || "00000";
  const zipCount = useZipCount(zip === "00000" ? undefined : zip);
  const [showZip, setShowZip] = useState(zip);
  useEffect(() => {
    setShowZip(zip);
  }, [zip]);

  const [tab, setTab] = useState<"feed" | "order">("feed");
  const [filter, setFilter] = useState<BiteFeedFilter>("trending");
  const [orders, setOrders] = useState<(BiteOrder & { id: string })[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const firstBatch = useRef(true);

  const [ddPlaces, setDdPlaces] = useState<DoorDashLinkedBusiness[]>([]);
  const [ddLoad, setDdLoad] = useState(false);
  const [ddErr, setDdErr] = useState<string | null>(null);
  const [manualPlaces, setManualPlaces] = useState<DoorDashLinkedBusiness[]>([]);
  const [manualErr, setManualErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDdLoad(true);
      setDdErr(null);
      try {
        const u = firebaseAuth?.currentUser;
        if (!u) {
          setDdPlaces([]);
          return;
        }
        const token = await u.getIdToken();
        const g = profile?.homeAddressGeo;
        const sp = new URLSearchParams();
        sp.set("radius", "12");
        if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
          sp.set("lat", String(g.lat));
          sp.set("lng", String(g.lng));
        }
        const r = await fetch(`/api/bites/nearby?${sp.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await r.json()) as { ok?: boolean; businesses?: DoorDashLinkedBusiness[] };
        if (!cancelled && j.ok && Array.isArray(j.businesses)) setDdPlaces(j.businesses);
        else if (!cancelled) setDdErr("Couldn’t load partners");
      } catch {
        if (!cancelled) setDdErr("Couldn’t load partners");
      } finally {
        if (!cancelled) setDdLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.homeAddressGeo]);

  useEffect(() => {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    const qy = query(collection(db, "restaurants"), where("isManualEntry", "==", true), limit(60));
    setManualErr(null);
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) =>
          manualRestaurantDocToLinkedBusiness(d.id, (d.data() ?? {}) as Record<string, unknown>),
        );
        setManualPlaces(rows);
      },
      (e) => {
        setManualPlaces([]);
        const msg = typeof e?.message === "string" ? e.message : "";
        if (msg.toLowerCase().includes("permission")) {
          setManualErr("Sign in to see restaurants.");
        } else {
          setManualErr("Couldn’t load restaurants.");
        }
      },
    );
  }, []);

  const places = useMemo(() => {
    const m = new Map<string, DoorDashLinkedBusiness>();
    for (const b of manualPlaces) m.set(b.id, b);
    for (const b of ddPlaces) {
      if (!m.has(b.id)) m.set(b.id, b);
    }
    return [...m.values()];
  }, [manualPlaces, ddPlaces]);

  useEffect(() => {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    const qy = query(
      collection(db, "biteOrders"),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    return onSnapshot(
      qy,
      (snap) => {
        if (firstBatch.current) {
          firstBatch.current = false;
          setOrders(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as BiteOrder) })),
          );
          return;
        }
        for (const ch of snap.docChanges()) {
          if (ch.type === "added") {
            const id = ch.doc.id;
            setNewIds((prev) => new Set(prev).add(id));
            setTimeout(() => {
              setNewIds((prev) => {
                const n = new Set(prev);
                n.delete(id);
                return n;
              });
            }, 1800);
          }
        }
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as BiteOrder) })),
        );
      },
      () => setOrders([]),
    );
  }, []);

  const filtered = useMemo(
    () => filterFeed(orders, filter, showZip === "00000" ? undefined : showZip),
    [orders, filter, showZip],
  );

  const trendingStrip = useMemo(() => {
    const zf = (o: BiteOrder & { id: string }) => {
      if (showZip === "00000" || !o.customerZip) return true;
      return o.customerZip === showZip;
    };
    return [...orders]
      .filter(zf)
      .sort((a, b) => (b.gridditCount ?? 0) - (a.gridditCount ?? 0))
      .slice(0, 6);
  }, [orders, showZip]);

  const onOrderSame = useCallback(
    (o: BiteOrder & { id: string }) => {
      cart.loadFromOrder(
        o.restaurantId,
        {
          name: o.restaurantName,
          cuisine: [],
          address: "",
          lat: 0,
          lng: 0,
          phone: "",
          isOpen: true,
          openHours: {},
          deliveryFee: 3.99,
          estimatedTime: "30m",
          rating: 4.5,
          priceRange: "$$",
          tags: [],
          imageUrl: "",
        },
        o.items,
      );
      router.push("/bites/checkout");
    },
    [cart, router],
  );

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{ background: "#0a0a0a" }}
    >
      <Link
        href="/home"
        className="fixed z-50 flex h-10 w-10 items-center justify-center text-lg font-bold text-white shadow-lg backdrop-blur"
        style={{
          top: 16,
          left: 16,
          zIndex: 50,
          background: "rgba(10,10,10,0.8)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "50%",
          width: 40,
          height: 40,
        }}
        aria-label="Back to home"
      >
        ←
      </Link>

      <header
        className="relative w-full overflow-hidden px-4 pb-6"
        style={{
          paddingTop: "max(4.5rem, calc(60px + env(safe-area-inset-top, 0px)))",
          background: "linear-gradient(180deg, rgba(255,107,0,0.15) 0%, transparent 100%)",
        }}
      >
        <div className="pt-1">
          <motion.h1
            className="font-[family-name:var(--font-bebas)] text-[56px] leading-[0.95] tracking-tight text-white"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <span>GRIDD BITES</span>{" "}
            <span className="align-middle text-5xl not-italic" aria-hidden>
              🍗
            </span>
          </motion.h1>
          <p
            className="mt-2 font-[family-name:var(--font-dm-sans)] text-[13px] text-[#555] dark:text-zinc-500"
            style={{ color: "#888888" }}
          >
            what&apos;s the hood eating rn
          </p>
        </div>

        <motion.div
          className="mt-5 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur"
          key={zipCount}
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <p className="text-sm text-zinc-400">
            <span className="text-[#ff6b00]">🔥</span>{" "}
            <motion.span
              key={zipCount}
              initial={{ y: 8, opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              className="font-mono text-lg font-bold text-white"
            >
              {zipCount}
            </motion.span>{" "}
            <span className="text-zinc-500">orders in {showZip === "00000" ? "your area" : showZip}</span>
          </p>
        </motion.div>
      </header>

      <div className="flex border-b border-white/[0.08] px-2">
        <button
          type="button"
          onClick={() => {
            setTab("feed");
          }}
          className={[
            "min-h-[48px] flex-1 border-b-2 px-2 py-2 text-sm font-extrabold transition-colors",
            tab === "feed" ? "border-[#ff6b00] text-[#ff6b00]" : "border-transparent text-zinc-500",
          ].join(" ")}
        >
          🔥 What&apos;s Poppin
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("order");
          }}
          className={[
            "min-h-[48px] flex-1 border-b-2 px-2 py-2 text-sm font-extrabold transition-colors",
            tab === "order" ? "border-[#ff6b00] text-[#ff6b00]" : "border-transparent text-zinc-500",
          ].join(" ")}
        >
          🍽️ Order
        </button>
      </div>

      <div className="relative min-h-[60dvh] flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {tab === "feed" ? (
            <motion.div
              key="feed"
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 28, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="absolute inset-0 space-y-3 overflow-y-auto px-3 pb-32 pt-3"
            >
              {trendingStrip.length > 0 ? (
                <div className="mb-2">
                  <p className="mb-2 text-xs font-extrabold tracking-wide text-zinc-400">🔥 Trending now</p>
                  <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
                    {trendingStrip.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => onOrderSame(o)}
                        className="min-w-[150px] shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-left backdrop-blur"
                      >
                        <div className="text-2xl">🥡</div>
                        <p className="mt-1 line-clamp-1 text-xs font-bold text-white">
                          {o.items[0]?.name ?? "Fan fave"}
                        </p>
                        <p className="line-clamp-1 text-[10px] text-zinc-500">{o.restaurantName}</p>
                        <p className="mt-1 text-[10px] font-extrabold text-[#ff6b00]">‼️ {o.gridditCount ?? 0} GRIDD</p>
                        <p className="text-[9px] text-zinc-600">Tap to order same</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {FEED_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={[
                      "rounded-full border px-2.5 py-1.5 text-[11px] font-bold",
                      filter === f.id
                        ? "border-[#ff6b00] bg-[#ff6b00]/20 text-[#ff6b00]"
                        : "border-white/10 text-zinc-500",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-12 text-center">
                  <motion.div
                    animate={{ y: [0, -16, 0] }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                    className="text-6xl"
                  >
                    🌮
                  </motion.div>
                  <p className="mt-4 font-[family-name:var(--font-syne)] text-xl font-black text-white">
                    No orders yet in your area
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">Be the first to show the hood 👀</p>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("order");
                    }}
                    className="mt-6 rounded-full bg-gradient-to-r from-[#ff6b00] to-[#ff9500] px-6 py-3 text-sm font-extrabold text-black"
                  >
                    Browse restaurants →
                  </button>
                </div>
              ) : (
                <motion.div
                  className="space-y-4"
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } } as const}
                >
                  {filtered.map((o) => (
                    <motion.div
                      key={o.id}
                      variants={{
                        hidden: { y: 40, opacity: 0 },
                        show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 380, damping: 32 } },
                      }}
                    >
                      <BitePoppinCard
                        order={o}
                        isNew={newIds.has(o.id)}
                        onOrderSame={onOrderSame}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="order"
              initial={{ x: 28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -28, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="absolute inset-0 space-y-4 overflow-y-auto px-3 pb-32 pt-3"
            >
              <p className="text-center text-xs text-zinc-500">3 taps: pick → confirm → pay + vibe + post</p>
              {ddErr ? <p className="text-center text-xs text-amber-500/90">{ddErr}</p> : null}
              {ddLoad ? <p className="text-center text-xs text-zinc-500">Loading partners…</p> : null}
              {places.map((b) => {
                const r = doorDashLinkedToBiteRestaurant(b);
                return (
                  <motion.button
                    key={b.id}
                    type="button"
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      cart.setRestaurant(b.id, r);
                      router.push(`/bites/restaurant/${encodeURIComponent(b.id)}`);
                    }}
                    className="w-full overflow-hidden text-left"
                  >
                    <div
                      className="relative w-full overflow-hidden rounded-[20px] border border-white/[0.08]"
                      style={{ minHeight: 160 }}
                    >
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt=""
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div
                          className="h-40 w-full"
                          style={{
                            background: "linear-gradient(135deg, #1a1a1a, #0a0a0a)",
                          }}
                        />
                      )}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.5) 40%, transparent 100%)",
                        }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 p-3">
                        <p className="line-clamp-2 text-lg font-black text-white drop-shadow">🍗 {b.name}</p>
                        <span className="shrink-0 rounded-full bg-gradient-to-r from-[#ff6b00] to-[#ff9500] px-3 py-1.5 text-xs font-extrabold text-black">
                          Order
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 px-0.5 text-xs text-zinc-400">
                      <span>⏱️ {r.estimatedTime}</span>
                      <span>🛵 ${r.deliveryFee.toFixed(2)}</span>
                      <span>⭐ {r.rating.toFixed(1)}</span>
                      {typeof b.distanceMiles === "number" ? <span>📍 {b.distanceMiles.toFixed(1)} mi</span> : null}
                    </div>
                    <p className="px-0.5 pt-0.5 text-[10px] text-zinc-600 line-clamp-1">{b.address}</p>
                  </motion.button>
                );
              })}
              {places.length === 0 && !ddLoad ? (
                <p className="px-1 text-center text-xs text-zinc-600">
                  {profile?.homeAddressGeo
                    ? "No restaurants found yet — add a manual restaurant in the CEO dashboard."
                    : "Set your home address in profile for best matches."}
                </p>
              ) : null}
              {manualErr ? <p className="px-1 text-center text-xs text-red-400">{manualErr}</p> : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {cart.lines.length > 0 ? (
        <motion.button
          type="button"
          initial={{ y: 90, opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          onClick={() => router.push("/bites/checkout")}
          className="fixed bottom-5 left-4 right-4 z-30 flex items-center justify-between gap-2 rounded-2xl px-4 py-3.5 text-white shadow-[0_0_32px_rgba(255,107,0,0.35)]"
          style={{ background: "linear-gradient(135deg, #ff6b00, #ff9500)" }}
        >
          <span className="rounded-lg bg-black/25 px-2 py-0.5 font-mono text-sm font-bold">{cart.lines.length} items</span>
          <span className="font-[family-name:var(--font-syne)] text-lg font-black tracking-wide">Order</span>
          <span className="font-mono text-sm font-bold">${cart.subtotal.toFixed(2)}</span>
        </motion.button>
      ) : null}

      <div className="mt-auto border-t border-white/5 px-3 py-4">
        <p className="text-center text-[10px] text-zinc-600">Delivered by DoorDash · GRIDD Bites</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {BITES_VIBE_PRESETS.slice(0, 8).map((t) => (
            <span key={t.id} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {t.emoji} {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
