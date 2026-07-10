"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { BiteOrderItem, BiteRestaurant } from "@/types/bites";
import { estimateOrderEconomics } from "@/lib/bitesPricing";

type BitesCartContextValue = {
  restaurant: BiteRestaurant | null;
  restaurantId: string | null;
  lines: BiteOrderItem[];
  setRestaurant: (id: string, r: BiteRestaurant) => void;
  setLines: (lines: BiteOrderItem[]) => void;
  addItem: (line: BiteOrderItem) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  loadFromOrder: (restaurantId: string, r: BiteRestaurant, items: BiteOrderItem[]) => void;
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  totalBeforeTip: number;
};

const Ctx = createContext<BitesCartContextValue | null>(null);

export function BitesCartProvider({ children }: { children: ReactNode }) {
  const [restaurantId, setRid] = useState<string | null>(null);
  const [restaurant, setR] = useState<BiteRestaurant | null>(null);
  const [lines, setLines] = useState<BiteOrderItem[]>([]);

  const setRestaurant = useCallback((id: string, r: BiteRestaurant) => {
    setRid(id);
    setR(r);
  }, []);

  const addItem = useCallback((line: BiteOrderItem) => {
    setLines((prev) => {
      const i = prev.findIndex((p) => p.itemId === line.itemId);
      if (i < 0) return [...prev, line];
      const n = [...prev];
      n[i] = { ...n[i]!, quantity: n[i]!.quantity + line.quantity, unitPrice: line.unitPrice };
      return n;
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setRid(null);
    setR(null);
    setLines([]);
  }, []);

  const loadFromOrder = useCallback((id: string, r: BiteRestaurant, items: BiteOrderItem[]) => {
    setRid(id);
    setR(r);
    setLines(items);
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [lines],
  );

  const deliveryFee = restaurant?.deliveryFee ?? 3.99;
  const econ = useMemo(
    () => estimateOrderEconomics(subtotal, deliveryFee, 0.12, 0.15, 0, 0),
    [subtotal, deliveryFee],
  );

  const value = useMemo(
    () =>
      ({
        restaurant,
        restaurantId,
        lines,
        setRestaurant,
        setLines,
        addItem,
        removeItem,
        clearCart,
        loadFromOrder,
        subtotal,
        serviceFee: econ.serviceFee,
        deliveryFee: econ.deliveryFee,
        totalBeforeTip: econ.customerPays,
      }) as BitesCartContextValue,
    [
      restaurant,
      restaurantId,
      lines,
      setRestaurant,
      addItem,
      removeItem,
      clearCart,
      loadFromOrder,
      subtotal,
      econ.serviceFee,
      econ.deliveryFee,
      econ.customerPays,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBitesCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBitesCart inside BitesCartProvider only");
  return v;
}
