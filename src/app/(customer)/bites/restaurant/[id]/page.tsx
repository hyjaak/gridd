"use client";

import { motion } from "framer-motion";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
} from "firebase/firestore";
import type { DocumentData, QuerySnapshot } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useBitesCart } from "@/contexts/BitesCartContext";
import { useAuth } from "@/hooks/useAuth";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import type { BiteMenuItem, BiteRestaurant } from "@/types/bites";
import type { BitesDoordashMenuItem } from "@/types/bitesDoordash";

function itemSlug(name: string) {
  return `item_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function toBiteMenuItem(m: BitesDoordashMenuItem): BiteMenuItem {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    price: m.price,
    category: m.category,
    imageUrl: m.imageUrl,
    isAvailable: m.isAvailable,
    calories: m.calories,
    tags: m.tags,
    gridditCount: 0,
    orderCount: 0,
  };
}

function fromCachedRestaurant(c: Record<string, unknown>, id: string): BiteRestaurant {
  const cuisineRaw = c.cuisine;
  const cuisineArr =
    Array.isArray(cuisineRaw) && cuisineRaw.every((x) => typeof x === "string")
      ? (cuisineRaw as string[])
      : typeof cuisineRaw === "string" && cuisineRaw.trim()
        ? cuisineRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : ["Local"];
  const hoursRaw = c.hours;
  const openHours =
    typeof hoursRaw === "object" && hoursRaw !== null && !Array.isArray(hoursRaw)
      ? (hoursRaw as Record<string, unknown>)
      : {};
  return {
    name: String(c.name ?? "Restaurant"),
    cuisine: cuisineArr,
    address: String(c.address ?? ""),
    lat: Number(c.lat ?? 0),
    lng: Number(c.lng ?? 0),
    phone: String(c.phone ?? "+10000000000"),
    isOpen: c.isOpen !== false,
    openHours,
    deliveryFee: Number(c.deliveryFee ?? 3.99),
    estimatedTime: String(c.deliveryTime ?? c.estimatedTime ?? "30–40 min"),
    rating: Number(c.rating ?? 4.5),
    priceRange: (c.priceRange as BiteRestaurant["priceRange"]) ?? "$$",
    tags: cuisineArr,
    imageUrl: String(c.imageUrl ?? ""),
    doordashExternalBusinessId: c.doordashId ? String(c.doordashId) : undefined,
    manualFulfillment: c.isManualEntry === true || c.manualFulfillment === true || c.source === "manual",
  };
}

export default function BitesRestaurantPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const rawId = typeof params.id === "string" ? decodeURIComponent(params.id) : "";
  const id = rawId;
  const cart = useBitesCart();
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const bundle = useMemo(() => null, []);

  const [menu, setMenu] = useState<BiteMenuItem[] | null>(null);
  const [menuErr, setMenuErr] = useState<string | null>(null);
  const [rLoading, setRLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(true);
  const [didPaintMenu, setDidPaintMenu] = useState(false);

  useEffect(() => {
    if (!id) {
      setRLoading(false);
      return;
    }
    if (!firebaseApp) {
      setMenuErr("App not ready");
      setRLoading(false);
      setMenuLoading(false);
      return;
    }

    setRLoading(true);
    setMenuLoading(true);
    setMenuErr(null);

    const db = getFirestore(firebaseApp);
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150);

    let menuResolved = false;
    const watchdog = window.setTimeout(() => {
      if (menuResolved) return;
      setMenuErr(
        "Menu is taking too long to load (Firestore listener not responding). Check Firestore rules for restaurants/*/menu* public read.",
      );
      setMenu([]);
      setMenuLoading(false);
    }, 9000);

    const unsubMeta = onSnapshot(
      doc(db, "restaurants", safe),
      (snap) => {
        if (snap.exists()) {
          const c = snap.data() as Record<string, unknown>;
          cartRef.current.setRestaurant(id, fromCachedRestaurant(c, id));
        }
        setRLoading(false);
      },
      (e) => {
        setMenuErr(e.message || "Restaurant error");
        setRLoading(false);
      },
    );

    function mapSnapDocs(
      snap: QuerySnapshot<DocumentData>,
      collectionName: "menu" | "menuItems",
    ): BiteMenuItem[] {
      return snap.docs
        .map((d) => {
          const x = d.data() as Record<string, unknown>;
          const availRaw = x.isAvailable ?? x.available;
          const isAvailable = typeof availRaw === "boolean" ? availRaw : true;
          if (!isAvailable) return null;
          const priceRaw = x.price;
          const price =
            typeof priceRaw === "number" ? priceRaw : typeof priceRaw === "string" ? Number(priceRaw) || 0 : 0;
          const category = String(x.category ?? "Menu");
          const name = String(x.name ?? "");
          if (!name.trim()) return null;
          const row: BiteMenuItem = {
            id: `${collectionName}/${d.id}`,
            name,
            description: String(x.description ?? ""),
            price,
            category,
            imageUrl: String(x.photoUrl ?? x.imageUrl ?? ""),
            isAvailable: true,
            calories:
              typeof x.calories === "number"
                ? x.calories
                : typeof x.calories === "string"
                  ? Number(x.calories) || 0
                  : 0,
            tags: [],
            gridditCount: 0,
            orderCount: 0,
          };
          return row;
        })
        .filter((x): x is BiteMenuItem => Boolean(x));
    }

    let lastMenuItems: BiteMenuItem[] = [];
    let lastMenuItemsAlt: BiteMenuItem[] = [];
    let menuPermDenied = false;
    let menuItemsPermDenied = false;

    const stringifyKey = (x: BiteMenuItem) => `${x.category}__${x.name}__${x.price}__${x.imageUrl ?? ""}`;
    const isSameMenu = (a: BiteMenuItem[] | null, b: BiteMenuItem[]) => {
      if (!a) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (stringifyKey(a[i]!) !== stringifyKey(b[i]!)) return false;
      }
      return true;
    };

    const recompute = () => {
      const merged = [...lastMenuItems, ...lastMenuItemsAlt];
      // de-dupe by name+category+price to avoid double listing if both collections exist
      const seen = new Set<string>();
      const deduped: BiteMenuItem[] = [];
      for (const it of merged) {
        const k = `${it.category}__${it.name}__${it.price}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(it);
      }
      deduped.sort((a, b) => {
        const c = a.category.localeCompare(b.category);
        if (c !== 0) return c;
        const n = a.name.localeCompare(b.name);
        if (n !== 0) return n;
        return a.price - b.price;
      });
      // eslint-disable-next-line no-console
      console.log("Menu items (merged):", deduped);
      setMenu((prev) => (isSameMenu(prev, deduped) ? prev : deduped));
      setDidPaintMenu(true);
      menuResolved = true;
      setMenuLoading(false);
      window.clearTimeout(watchdog);

      // If we have no items but one of the collections is permission-denied,
      // surface it explicitly (common cause of "empty menu" confusion).
      if (deduped.length === 0 && (menuPermDenied || menuItemsPermDenied)) {
        setMenuErr("permission denied");
      }
    };

    const unsubMenu = onSnapshot(
      collection(db, "restaurants", safe, "menu"),
      (snap) => {
        lastMenuItems = mapSnapDocs(snap, "menu");
        recompute();
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("Menu error (menu):", err);
        menuPermDenied = Boolean(err?.message?.toLowerCase?.().includes?.("permission"));
        if (!menuResolved) {
          setMenuErr(
            err?.message?.toLowerCase?.().includes?.("permission") ? "permission denied" : err.message || "Menu error",
          );
          menuResolved = true;
          setMenu([]);
          setMenuLoading(false);
          window.clearTimeout(watchdog);
        }
      },
    );

    const unsubMenuItems = onSnapshot(
      collection(db, "restaurants", safe, "menuItems"),
      (snap) => {
        lastMenuItemsAlt = mapSnapDocs(snap, "menuItems");
        recompute();
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("Menu error (menuItems):", err);
        menuItemsPermDenied = Boolean(err?.message?.toLowerCase?.().includes?.("permission"));
        // Only surface if nothing else resolved
        if (!menuResolved) {
          setMenuErr(
            err?.message?.toLowerCase?.().includes?.("permission") ? "permission denied" : err.message || "Menu error",
          );
          menuResolved = true;
          setMenu([]);
          setMenuLoading(false);
          window.clearTimeout(watchdog);
        }
      },
    );

    return () => {
      unsubMeta();
      unsubMenu();
      unsubMenuItems();
      window.clearTimeout(watchdog);
    };
  }, [id, bundle]);

  const onAdd = useCallback(
    (m: BiteMenuItem) => {
      if (!id) return;
      if (cart.restaurant) {
        cart.setRestaurant(id, cart.restaurant);
      } else {
        return;
      }
      cart.addItem({
        itemId: m.id ?? itemSlug(m.name),
        name: m.name,
        quantity: 1,
        unitPrice: m.price,
        category: m.category,
      });
    },
    [cart, id],
  );

  if (!id) {
    return (
      <div className="min-h-[100dvh] bg-[#050505] px-4 py-6 text-center text-sm text-zinc-500">
        Invalid link.
      </div>
    );
  }

  const r = cart.restaurant;
  if (!r && rLoading) return <LoadingScreen />;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#050505] text-white">
      <header className="border-b border-white/10 px-3 py-2">
        <BackButton href="/bites" />
      </header>
      <div className="px-4 py-4">
        <h1 className="font-[family-name:var(--font-syne)] text-2xl font-black">🍗 {r?.name ?? "Loading…"}</h1>
        {r?.address ? <p className="text-xs text-zinc-500">{r.address}</p> : null}
        {r ? (
          <p className="mt-1 text-sm text-zinc-400">
            {r.estimatedTime} · ${r.deliveryFee.toFixed(2)} delivery · ⭐{r.rating}
            {r.manualFulfillment ? (
              <span className="ml-1 text-[10px] text-amber-300">· manual fulfillment</span>
            ) : (
              <span className="ml-1 text-[10px] text-[#3dff7a]">· Drive partner</span>
            )}
          </p>
        ) : null}

        {menuErr ? <p className="mt-2 text-sm text-amber-500">{menuErr}</p> : null}
        {menuErr && menuErr.toLowerCase().includes("permission") ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-4">
            <p className="text-sm font-semibold text-white">Sign in required</p>
            <p className="mt-1 text-sm text-zinc-400">
              This menu is blocked by Firestore rules. Sign in, or make <span className="font-mono">restaurants/*/menu/*</span>{" "}
              public-read in Firebase rules.
            </p>
            <Button
              type="button"
              className="mt-3 w-full"
              onClick={() => {
                router.push("/?modal=login");
              }}
            >
              Sign in
            </Button>
          </div>
        ) : null}
        {menu && menu.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">
            No menu items found yet for this store.
          </p>
        ) : null}
        {menuLoading && !menuErr ? (
          <p className="mt-3 text-xs text-zinc-500">Loading menu…</p>
        ) : null}

        <div className="mt-4 space-y-6">
          {Object.entries(
            (menu ?? []).reduce<Record<string, BiteMenuItem[]>>((acc, item) => {
              const cat = item.category || "Menu";
              (acc[cat] = acc[cat] ?? []).push(item);
              return acc;
            }, {}),
          ).map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-2 font-[family-name:var(--font-syne)] text-xs font-bold uppercase tracking-wider text-[#3dff7a]">
                {category}
              </h2>
              <ul className="space-y-2">
                {items.map((m) => (
                  <motion.li
                    key={m.id ?? itemSlug(m.name)}
                    initial={didPaintMenu ? false : { y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "tween", duration: 0.15 }}
                  >
                    <Card className="flex items-start justify-between gap-3 border border-white/10 bg-zinc-900/50 p-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{m.name}</p>
                        <p className="line-clamp-2 text-xs text-zinc-500">{m.description}</p>
                        <p className="mt-1 text-sm font-mono text-[#ff6b00]">
                          ${m.price.toFixed(2)}
                          {m.certified ? " · 🏆 GRIDD top pick" : ""}
                        </p>
                      </div>
                      <motion.div whileTap={{ scale: 0.92 }} className="shrink-0">
                        <Button type="button" onClick={() => onAdd(m)}>
                          Add
                        </Button>
                      </motion.div>
                    </Card>
                  </motion.li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            className="w-full text-base font-bold"
            onClick={() => {
              if (!user) {
                router.push("/?modal=login");
                return;
              }
              router.push("/bites/checkout");
            }}
          >
            Checkout · ${cart.subtotal.toFixed(2)}
          </Button>
          {!user ? <p className="text-center text-xs text-zinc-500">Sign in to checkout.</p> : null}
        </div>
      </div>
    </div>
  );
}
