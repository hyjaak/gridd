"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  CockpitDriver, CockpitJob, CockpitVehicle, InventoryItem,
  CockpitAnalytics, LiveEvent, PricingEstimate, PricingInput,
} from "./types";
import {
  DRIVERS, JOBS, VEHICLES, INVENTORY, ANALYTICS, EVENTS, WEATHER, FUEL,
  computePricing, generateDriverHeartbeat,
} from "./data";

type RealtimeState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

function useRealtime<T>(initial: T[], interval: number, updater: (prev: T[]) => T[]): RealtimeState<T> {
  const [data, setData] = useState<T[]>(initial);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setData(updater);
    }, interval);
    return () => clearInterval(timer);
  }, [interval, updater]);

  return { data, loading, error };
}

export function useDrivers() {
  return useRealtime(DRIVERS, 5000, (prev) =>
    prev.map((d) => ({ ...d, ...generateDriverHeartbeat() }))
  );
}

export function useDispatch() {
  const [data, setData] = useState(JOBS);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  // Simulate new jobs appearing
  useEffect(() => {
    const timer = setInterval(() => {
      setData((prev) => {
        const shuffled = [...prev].sort(() => Math.random() - 0.5);
        return shuffled;
      });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return { data, loading, error };
}

export function useFleet() {
  return useRealtime(VEHICLES, 10000, (prev) =>
    prev.map((v) => ({
      ...v,
      fuelLevel: Math.max(0, v.fuelLevel - Math.random() * 0.5),
      odometer: v.odometer + Math.round(Math.random() * 2),
    }))
  );
}

export function useInventory() {
  const [data, setData] = useState(INVENTORY);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  return { data, loading, error };
}

export function useAnalytics() {
  const [data] = useState<CockpitAnalytics>(ANALYTICS);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  return { data, loading, error };
}

export function useEvents() {
  const [data, setData] = useState<LiveEvent[]>(EVENTS);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  // Push occasional new events
  useEffect(() => {
    const timer = setInterval(() => {
      const eventTypes = [
        { type: "job" as const, title: "New job assigned", severity: "success" as const },
        { type: "payment" as const, title: "Payment processed", severity: "success" as const },
        { type: "ai" as const, title: "AI recommendation updated", severity: "info" as const },
        { type: "maintenance" as const, title: "Vehicle status changed", severity: "warning" as const },
      ];
      const pick = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      setData((prev) => [
        {
          id: `evt-${Date.now()}`,
          type: pick.type,
          title: pick.title,
          description: `Auto-generated event at ${new Date().toLocaleTimeString()}`,
          timestamp: new Date().toISOString(),
          severity: pick.severity,
        },
        ...prev.slice(0, 49),
      ]);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  return { data, loading, error };
}

export function usePricing(input: PricingInput | null) {
  const [estimate, setEstimate] = useState<PricingEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    if (!input) {
      setEstimate(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      setEstimate(computePricing(input));
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  return { estimate, loading, error };
}

export function useWeather() {
  return { data: WEATHER, loading: false, error: null };
}

export function useFuel() {
  return { data: FUEL, loading: false, error: null };
}

export function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
}