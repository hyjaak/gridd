"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, getFirestore, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { services } from "@/constants";
import type { Provider } from "@/types";
import type { DriverTier } from "@/types";
import type { Urgency } from "@/types/booking";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { previewChatJobId } from "@/lib/roadside-chat";
import { BookingJobChat } from "@/components/chat/BookingJobChat";
import { BookingLocationSection } from "@/components/booking/BookingLocationSection";
import { BackButton } from "@/components/BackButton";
import { CustomerNav } from "@/components/CustomerNav";
import { estimateCentsForService, estimateSubtotalUsdBeforeFee } from "@/lib/booking-estimate";
import { computeRideLineItems, metersToMiles } from "@/lib/calculatePrice";
import { estimateDurationSecondsFromMiles, haversineRoadMiles } from "@/lib/geo";
import { fetchPriceIQEstimate, type PriceIQEstimateResult } from "@/lib/priceIQ";
import { buildPriceIQOptions } from "@/lib/priceIQ-options";
import type { AddressResolved } from "@/components/AddressInput";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { stripUndefinedDeep } from "@/lib/sanitizeFirestore";
import { getCustomerBookingBlock } from "@/lib/customer-account";
import type { RideTierEstimateRow } from "@/lib/uberGriddTiers";
import { UBER_BOOKING_ENABLED } from "@/lib/uberBookingFeature";
import {
  checkSmartDiscount,
  griddProfitAfterDiscountUsd,
  mergeSmartDiscountConfig,
  type DiscountCheck,
  type SmartDiscountConfig,
} from "@/lib/smartDiscount";

type ServiceId = (typeof services)[number]["id"];

type ServiceMeta = {
  id: ServiceId;
  icon: string;
  color: string;
  label: string;
};

const SERVICE_META: Record<ServiceId, Omit<ServiceMeta, "id">> = {
  haul: { icon: "🚛", color: "#FF6B00", label: "Haul" },
  send: { icon: "📦", color: "#3B82F6", label: "Send" },
  ride: { icon: "🚗", color: "#8B5CF6", label: "Ride" },
  help: { icon: "💪", color: "#F59E0B", label: "Help" },
  cuts: { icon: "🌳", color: "#22c55e", label: "Cuts" },
  lawn: { icon: "🌿", color: "#16a34a", label: "Lawn" },
  pressure: { icon: "💧", color: "#06B6D4", label: "Pressure" },
  snow: { icon: "❄️", color: "#93C5FD", label: "Snow" },
  gutter: { icon: "🏠", color: "#A78BFA", label: "Gutter" },
  fence: { icon: "🔧", color: "#D97706", label: "Fence" },
  protect: { icon: "🛡️", color: "#EC4899", label: "Protect" },
  roadside: { icon: "🛞", color: "#ef4444", label: "Roadside" },
  evcharge: { icon: "⚡", color: "#3B82F6", label: "EV Charge" },
};

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function tierRank(t: DriverTier | undefined): number {
  switch (t) {
    case "gold":
      return 4;
    case "silver":
      return 3;
    case "bronze":
      return 2;
    case "starter":
      return 1;
    default:
      return 0;
  }
}

type MatchedProvider = Provider & { score: number; etaMinutes: number; distance: number };

const BOOK_CUSTOMER = ["customer"] as const;

function CustomerBookInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { loading: gateLoading, ok } = useRequireAuth([...BOOK_CUSTOMER]);
  const { user, profile } = useAuth();

  const validServiceIds = useMemo(() => new Set(services.map((s) => s.id)), []);
  const rawService = params.get("service") ?? "haul";
  const initialService = (validServiceIds.has(rawService as ServiceId) ? rawService : "haul") as ServiceId;

  const [service, setService] = useState<ServiceId>(initialService);
  const [form, setForm] = useState<Record<string, unknown>>({
    weight: "medium",
    itemsCount: 5,
    yardSize: "medium",
    lawnServices: { mow: true, edge: true, blow: true, bags: false },
    treeCount: "1",
    treeSize: "",
    rideType: "standard",
    pressureSurface: "driveway",
    sqFt: 800,
    helpHours: 2,
    sendSize: "medium",
    protectPlan: "basic",
    snowUrgency: "today",
    snowProperty: "driveway",
    fenceLength: 40,
    fenceMaterial: "wood",
    gutterStories: 1,
    roadsideType: "flat_tire",
    evType: "tesla",
    batteryPct: 15,
    towDestination: "",
    routeDurationSeconds: 0,
  });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("today");
  const [providers, setProviders] = useState<MatchedProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [resolvedZip, setResolvedZip] = useState<string | undefined>();
  const [routeMeters, setRouteMeters] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [priceIQResult, setPriceIQResult] = useState<PriceIQEstimateResult | null>(null);
  const [priceIQLoading, setPriceIQLoading] = useState(false);
  /** Re-fetch ride PriceIQ on a 60s cadence (live market). */
  const [ridePriceTick, setRidePriceTick] = useState(0);
  const [uberTiers, setUberTiers] = useState<RideTierEstimateRow[] | null>(null);
  const [uberEstLoading, setUberEstLoading] = useState(false);
  const [uberConn, setUberConn] = useState<boolean | null>(null);
  const [uberRequestBusy, setUberRequestBusy] = useState(false);
  const [bookNowBusy, setBookNowBusy] = useState(false);
  const [smartDiscountConfig, setSmartDiscountConfig] = useState<Partial<SmartDiscountConfig> | null>(null);
  const [smartDiscountResult, setSmartDiscountResult] = useState<DiscountCheck | null>(null);
  const demandZipSentRef = useRef<string | null>(null);

  const meta = SERVICE_META[service];

  const topProvider = providers[0];

  const scrollToBookingChat = useCallback(() => {
    document.getElementById("booking-preview-chat")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    setService(initialService);
  }, [initialService]);

  /** GRIDD Pulse — silent demand ping when booking ZIP is known (Firestore increment via API). */
  useEffect(() => {
    const raw = resolvedZip ?? profile?.zip;
    const zip = typeof raw === "string" ? raw.replace(/\D/g, "").slice(0, 5) : "";
    if (zip.length !== 5) return;
    if (demandZipSentRef.current === zip) return;
    demandZipSentRef.current = zip;
    void fetch("/api/demand-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip }),
    }).catch(() => {});
  }, [resolvedZip, profile?.zip]);

  useEffect(() => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("service", service);
    router.replace(`/book?${sp.toString()}`);
  }, [service, params, router]);

  useEffect(() => {
    if (service !== "ride") return;
    const id = window.setInterval(() => setRidePriceTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [service]);

  const cutsReady = service !== "cuts" || Boolean(String(form.treeSize ?? "").trim());

  const rideTierPreviewUsd = useMemo(() => {
    if (service !== "ride" || routeMeters == null || routeMeters <= 0) return null;
    const miles = metersToMiles(routeMeters);
    const sec = Number(form.routeDurationSeconds ?? 0);
    const baseOpts =
      sec > 0
        ? { durationSeconds: sec, durationMinutes: sec / 60 }
        : { durationMinutes: 15 as number };
    return {
      standard: computeRideLineItems(miles, { ...baseOpts, rideType: "standard" }, {}).finalTotal,
      xl: computeRideLineItems(miles, { ...baseOpts, rideType: "xl" }, {}).finalTotal,
      premium: computeRideLineItems(miles, { ...baseOpts, rideType: "premium" }, {}).finalTotal,
    };
  }, [service, routeMeters, form.routeDurationSeconds]);

  const baseEstimateCents = useMemo(
    () => (cutsReady ? estimateCentsForService(service, form, urgency, routeMeters) : 0),
    [service, form, urgency, routeMeters, cutsReady],
  );

  const needsRouteForEstimate = useMemo(() => {
    if (service === "send" || service === "ride" || service === "haul") return true;
    if (service === "roadside" && form.roadsideType === "tow") return true;
    return false;
  }, [service, form.roadsideType]);

  const fForm = form as Record<string, unknown>;
  const pickupCoords = fForm.pickupCoords as { lat: number; lng: number } | undefined;
  const dropoffCoords = fForm.dropoffCoords as { lat: number; lng: number } | undefined;
  const addressCoords = fForm.addressCoords as { lat: number; lng: number } | undefined;
  const towDestinationCoords = fForm.towDestinationCoords as { lat: number; lng: number } | undefined;

  const routeEndpointKey = useMemo(() => {
    if (service === "roadside" && form.roadsideType === "tow") {
      const o = addressCoords;
      const d = towDestinationCoords;
      return `tow|${o?.lat ?? ""},${o?.lng ?? ""}|${d?.lat ?? ""},${d?.lng ?? ""}`;
    }
    const o = pickupCoords;
    const d = dropoffCoords;
    return `rt|${o?.lat ?? ""},${o?.lng ?? ""}|${d?.lat ?? ""},${d?.lng ?? ""}`;
  }, [
    service,
    form.roadsideType,
    pickupCoords?.lat,
    pickupCoords?.lng,
    dropoffCoords?.lat,
    dropoffCoords?.lng,
    addressCoords?.lat,
    addressCoords?.lng,
    towDestinationCoords?.lat,
    towDestinationCoords?.lng,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!needsRouteForEstimate) {
        setRouteMeters(null);
        setForm((p) => ({ ...p, routeDurationSeconds: 0 }));
        return;
      }
      const f = form as Record<string, unknown>;
      const pick = f.pickupCoords as { lat: number; lng: number } | undefined;
      const drop = f.dropoffCoords as { lat: number; lng: number } | undefined;
      const addr = f.addressCoords as { lat: number; lng: number } | undefined;
      const towD = f.towDestinationCoords as { lat: number; lng: number } | undefined;
      const origin =
        service === "roadside" && form.roadsideType === "tow" ? addr ?? null : pick ?? null;
      const dest =
        service === "roadside" && form.roadsideType === "tow" ? towD ?? null : drop ?? null;
      if (!origin || !dest) {
        setRouteMeters(null);
        setForm((p) => ({ ...p, routeDurationSeconds: 0 }));
        return;
      }
      setRouteLoading(true);
      try {
        const res = await fetch("/api/maps/distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination: dest }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          meters?: number;
          durationSeconds?: number;
        } | null;
        if (!cancelled && res.ok && data?.ok && typeof data.meters === "number") {
          setRouteMeters(data.meters);
          const mi = metersToMiles(data.meters);
          const ds =
            typeof data.durationSeconds === "number" && data.durationSeconds > 0
              ? data.durationSeconds
              : estimateDurationSecondsFromMiles(mi);
          setForm((p) => ({ ...p, routeDurationSeconds: ds }));
        } else if (!cancelled) {
          const miles = haversineRoadMiles(origin.lat, origin.lng, dest.lat, dest.lng);
          const meters = miles * 1609.34;
          const ds = estimateDurationSecondsFromMiles(miles);
          setRouteMeters(meters);
          setForm((p) => ({ ...p, routeDurationSeconds: ds }));
        }
      } catch {
        if (!cancelled) {
          const miles = haversineRoadMiles(origin.lat, origin.lng, dest.lat, dest.lng);
          const meters = miles * 1609.34;
          const ds = estimateDurationSecondsFromMiles(miles);
          setRouteMeters(meters);
          setForm((p) => ({ ...p, routeDurationSeconds: ds }));
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // form coords are encoded in routeEndpointKey; do not depend on full `form` (typing would re-fetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRouteForEstimate, routeEndpointKey, service, form.roadsideType]);

  const liveEstimateCents = baseEstimateCents;

  const isQuoteRoadside = useMemo(
    () =>
      service === "roadside" &&
      (form.roadsideType === "tire_replace" || form.roadsideType === "tow"),
    [service, form.roadsideType],
  );

  const effectiveEstimateCents = useMemo(() => {
    if (isQuoteRoadside) return liveEstimateCents;
    if (service === "cuts" && !cutsReady) return 0;
    if (priceIQResult !== null) return Math.round(priceIQResult.priceUsd * 100);
    return liveEstimateCents;
  }, [isQuoteRoadside, liveEstimateCents, priceIQResult, service, cutsReady]);

  const subtotalUsdForSmartDiscount = useMemo(() => {
    if (priceIQResult != null) return priceIQResult.breakdown.subtotalUsd;
    return estimateSubtotalUsdBeforeFee(service, form, urgency, routeMeters);
  }, [priceIQResult, service, form, urgency, routeMeters]);

  const griddUsdBeforeDiscount = useMemo(
    () => effectiveEstimateCents / 100,
    [effectiveEstimateCents],
  );

  const platformFeeUsdForSmart = useMemo(() => {
    if (priceIQResult != null) return priceIQResult.breakdown.platformFeeUsd;
    return Math.max(0, griddUsdBeforeDiscount - subtotalUsdForSmartDiscount);
  }, [priceIQResult, griddUsdBeforeDiscount, subtotalUsdForSmartDiscount]);

  const discountMiles = useMemo(() => {
    if (priceIQResult != null && priceIQResult.miles > 0) return priceIQResult.miles;
    if (typeof routeMeters === "number" && routeMeters > 0) return metersToMiles(routeMeters);
    return 0;
  }, [priceIQResult, routeMeters]);

  const completedJobs = profile?.completedJobCount ?? 0;
  const isNewForDiscount = completedJobs === 0;
  const uberSurgeMult = priceIQResult?.priceIQMetaRide?.surgeMultiplier ?? 1;

  const finalEstimateCents = useMemo(() => {
    if (!smartDiscountResult?.eligible) return effectiveEstimateCents;
    return Math.max(
      0,
      effectiveEstimateCents - Math.round(smartDiscountResult.discountAmount * 100),
    );
  }, [effectiveEstimateCents, smartDiscountResult]);

  useEffect(() => {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    const dref = doc(db, "pricingConfig", "smartDiscount");
    const unsub = onSnapshot(dref, (snap) => {
      setSmartDiscountConfig(snap.exists() ? (snap.data() as Partial<SmartDiscountConfig>) : null);
    });
    return () => unsub();
  }, [firebaseApp]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid || isQuoteRoadside || !cutsReady || effectiveEstimateCents <= 0) {
      setSmartDiscountResult(null);
      return;
    }
    const lat = pickupCoords?.lat ?? addressCoords?.lat ?? 0;
    const lng = pickupCoords?.lng ?? addressCoords?.lng ?? 0;
    void (async () => {
      const r = await checkSmartDiscount(
        user.uid,
        service,
        griddUsdBeforeDiscount,
        discountMiles,
        lat,
        lng,
        isNewForDiscount,
        completedJobs,
        uberSurgeMult,
        mergeSmartDiscountConfig(smartDiscountConfig),
        {
          subtotalUsd: subtotalUsdForSmartDiscount,
          platformFeeUsd: platformFeeUsdForSmart,
          platformFeePct: priceIQResult?.breakdown.platformFeePct ?? 0.15,
        },
      );
      if (!cancelled) setSmartDiscountResult(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.uid,
    isQuoteRoadside,
    cutsReady,
    effectiveEstimateCents,
    service,
    griddUsdBeforeDiscount,
    discountMiles,
    pickupCoords?.lat,
    pickupCoords?.lng,
    addressCoords?.lat,
    addressCoords?.lng,
    isNewForDiscount,
    completedJobs,
    uberSurgeMult,
    smartDiscountConfig,
    subtotalUsdForSmartDiscount,
    platformFeeUsdForSmart,
    priceIQResult,
  ]);

  useEffect(() => {
    let cancelled = false;
    const zipRaw = (resolvedZip ?? profile?.zip ?? "").replace(/\D/g, "").slice(0, 5);
    if (!cutsReady) {
      setPriceIQResult(null);
      setPriceIQLoading(false);
      return;
    }
    if (zipRaw.length !== 5 || !firebaseAuth?.currentUser) {
      setPriceIQResult(null);
      return;
    }
    if (needsRouteForEstimate && (routeMeters == null || routeMeters <= 0)) {
      setPriceIQResult(null);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setPriceIQLoading(true);
        try {
          const token = await firebaseAuth!.currentUser!.getIdToken();
          const options = buildPriceIQOptions(service, form, urgency);
          const r = await fetchPriceIQEstimate(
            { service, zipCode: zipRaw, meters: routeMeters, options },
            token,
          );
          if (!cancelled) setPriceIQResult(r);
        } catch {
          if (!cancelled) setPriceIQResult(null);
        } finally {
          if (!cancelled) setPriceIQLoading(false);
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [service, form, routeMeters, resolvedZip, profile?.zip, needsRouteForEstimate, urgency, cutsReady, ridePriceTick]);

  useEffect(() => {
    let cancelled = false;
    if (!firebaseAuth?.currentUser) {
      setUberConn(null);
      return;
    }
    void (async () => {
      try {
        const token = await firebaseAuth.currentUser!.getIdToken();
        const r = await fetch("/api/uber/connection", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await r.json().catch(() => ({}))) as { connected?: boolean };
        if (!cancelled) setUberConn(!!j.connected);
      } catch {
        if (!cancelled) setUberConn(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    if (service !== "ride" || !firebaseAuth?.currentUser) {
      setUberTiers(null);
      setUberEstLoading(false);
      return;
    }
    const ff = form as Record<string, unknown>;
    const p = ff.pickupCoords as { lat?: number; lng?: number } | undefined;
    const d = ff.dropoffCoords as { lat?: number; lng?: number } | undefined;
    if (!p?.lat || !p?.lng || !d?.lat || !d?.lng || routeMeters == null || routeMeters <= 0) {
      setUberTiers(null);
      setUberEstLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setUberEstLoading(true);
        try {
          const token = await firebaseAuth!.currentUser!.getIdToken();
          const u = new URL("/api/uber/estimates", window.location.origin);
          u.searchParams.set("startLat", String(p.lat));
          u.searchParams.set("startLng", String(p.lng));
          u.searchParams.set("endLat", String(d.lat));
          u.searchParams.set("endLng", String(d.lng));
          u.searchParams.set("meters", String(routeMeters));
          const sec = Number(form.routeDurationSeconds ?? 0);
          if (sec > 0) u.searchParams.set("durationSeconds", String(sec));
          const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
          const j = (await r.json().catch(() => null)) as {
            ok?: boolean;
            tiers?: RideTierEstimateRow[];
          };
          if (!cancelled && j?.ok && Array.isArray(j.tiers)) setUberTiers(j.tiers);
          else if (!cancelled) setUberTiers(null);
        } catch {
          if (!cancelled) setUberTiers(null);
        } finally {
          if (!cancelled) setUberEstLoading(false);
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [service, form, routeMeters, user?.uid]);

  const estimateDisplay = isQuoteRoadside
    ? "Quote"
    : routeLoading && needsRouteForEstimate
      ? "…"
      : priceIQLoading
        ? "…"
        : service === "cuts" && !cutsReady
          ? "Select options to see price"
          : money(finalEstimateCents);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setProvidersLoading(true);
      const res = await fetch(`/api/providers?service=${encodeURIComponent(service)}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = res ? ((await res.json().catch(() => null)) as { items?: Provider[] } | null) : null;
      const items = json?.items ?? [];

      const matched: MatchedProvider[] = items.map((p, idx) => {
        const rating = typeof p.rating === "number" ? p.rating : 4.6;
        const serviceMatch = (p.serviceIds ?? []).includes(service) ? 1 : 0;
        const distance = 0.2 + idx * 0.35;
        const etaMinutes = Math.round(8 + distance * 10);
        const tr = tierRank(p.driverTier);
        const score = rating * 12 + serviceMatch * 18 - distance * 5 + tr * 2;
        return { ...p, score, etaMinutes, distance };
      });

      matched.sort((a, b) => b.score - a.score);
      if (!cancelled) setProviders(matched.slice(0, 8));
      if (!cancelled) setProvidersLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [service]);

  const addressForJob = useCallback(() => {
    if (service === "ride" || service === "send" || service === "haul") {
      const a = [String(form.pickup ?? ""), String(form.dropoff ?? "")].filter(Boolean).join(" → ");
      return a.trim();
    }
    if (service === "roadside" && form.roadsideType === "tow") {
      const a = [String(form.address ?? ""), String(form.towDestination ?? "")]
        .filter(Boolean)
        .join(" → ");
      return a.trim();
    }
    return String(form.address ?? "").trim();
  }, [form, service]);

  const requestUberNetwork = useCallback(async () => {
    if (!firebaseApp || !user) {
      router.push("/?modal=login");
      return;
    }
    const block = getCustomerBookingBlock(profile);
    if (block.blocked) {
      alert(block.message);
      return;
    }
    const addr = addressForJob();
    if (!addr) {
      alert("Add pickup and destination.");
      return;
    }
    const ff = form as Record<string, unknown>;
    const p = ff.pickupCoords as { lat?: number; lng?: number } | undefined;
    const d = ff.dropoffCoords as { lat?: number; lng?: number } | undefined;
    if (!p?.lat || !p?.lng || !d?.lat || !d?.lng) {
      alert("Resolve both addresses on the map.");
      return;
    }
    const rt = String(form.rideType ?? "standard");
    const tierKey = rt === "cargo" || rt === "premium" ? "premium" : rt === "xl" ? "xl" : "standard";
    const row = uberTiers?.find((x) => x.griddType === tierKey);
    if (!row?.productId) {
      alert(
        "Uber estimates are not ready for this route. Add UBER_SERVER_TOKEN in Vercel and try again.",
      );
      return;
    }
    if (!firebaseAuth?.currentUser) return;
    setUberRequestBusy(true);
    try {
      const token = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch("/api/uber/ride", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: row.productId,
          fareId: row.fareId ?? undefined,
          startLat: p.lat,
          startLng: p.lng,
          endLat: d.lat,
          endLng: d.lng,
          startAddress: String(form.pickup ?? ""),
          endAddress: String(form.dropoff ?? ""),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        jobId?: string | null;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Could not request Uber ride.");
        return;
      }
      if (j.jobId) router.push(`/track/${j.jobId}`);
      else router.push("/history");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Uber request failed.");
    } finally {
      setUberRequestBusy(false);
    }
  }, [firebaseApp, user, profile, form, addressForJob, uberTiers, router]);

  const patchResolved = useCallback(
    (coordsKey: string) => (info: AddressResolved | null) => {
      setForm((p) => ({
        ...p,
        [coordsKey]: info ? { lat: info.lat, lng: info.lng } : undefined,
      }));
      if (info?.zip) setResolvedZip(info.zip);
    },
    [],
  );

  const bookWithProvider = useCallback(
    async (p: MatchedProvider) => {
      if (!firebaseApp || !user) {
        router.push("/?modal=login");
        return;
      }
      const block = getCustomerBookingBlock(profile);
      if (block.blocked) {
        alert(block.message);
        return;
      }
      if (service === "cuts" && !String(form.treeSize ?? "").trim()) {
        alert("Select a tree size to see pricing and book.");
        return;
      }
      const addr = addressForJob();
      if (!addr) {
        alert("Add an address to continue.");
        return;
      }
      setBookingId(p.uid);
      try {
        const db = getFirestore(firebaseApp);
        const city = addr.includes(",") ? addr.split(",").slice(-2, -1)[0]?.trim() ?? "Local" : "Local";
        const needsQuote = isQuoteRoadside;
        const payCents = needsQuote ? 0 : finalEstimateCents;
        const subtotalUsd =
          priceIQResult != null
            ? priceIQResult.breakdown.subtotalUsd
            : estimateSubtotalUsdBeforeFee(service, form, urgency, routeMeters);
        const platformFeeUsd =
          priceIQResult != null ? priceIQResult.breakdown.platformFeeUsd : subtotalUsd * 0.15;
        const providerPayoutCents = Math.round((subtotalUsd - platformFeeUsd) * 100);
        const bookingDetailsRaw: Record<string, unknown> = {
          ...form,
          urgency,
          ...(typeof routeMeters === "number" ? { routeMeters } : {}),
          ...(needsQuote ? { needsQuote: true as const } : {}),
        };
        const jobPayload: Record<string, unknown> = {
          customerUid: user.uid,
          customerName: profile?.name ?? user.email?.split("@")[0] ?? "Customer",
          serviceId: service,
          serviceName: meta.label,
          tier: "standard",
          status: "pending",
          city,
          zip: resolvedZip ?? profile?.zip ?? "",
          addressLine: addr,
          amountCents: payCents,
          providerPayoutCents: needsQuote ? 0 : providerPayoutCents,
          providerUid: p.uid,
          providerName: p.name ?? "",
          providerRating: typeof p.rating === "number" ? p.rating : 0,
          providerPhotoUrl: p.photoUrl ?? "",
          createdAt: new Date().toISOString(),
          bookingDetails: stripUndefinedDeep(bookingDetailsRaw),
          paymentStatus: needsQuote ? "quote_pending" : "pending",
          payoutStatus: "none",
        };
        if (smartDiscountResult?.eligible) {
          jobPayload.listedPriceCents = effectiveEstimateCents;
          jobPayload.smartDiscountCents = Math.round(smartDiscountResult.discountAmount * 100);
          jobPayload.smartDiscountRule = smartDiscountResult.reason;
        }
        if (notes.trim()) jobPayload.notes = notes.trim();
        const jobData = stripUndefinedDeep(jobPayload) as Record<string, unknown>;
        console.log("POST DATA:", JSON.stringify(jobData));
        const ref = await addDoc(collection(db, "jobs"), jobData);
        if (smartDiscountResult?.eligible) {
          try {
            await addDoc(collection(db, "discounts"), {
              customerId: user.uid,
              jobId: ref.id,
              service,
              originalPrice: effectiveEstimateCents / 100,
              discountAmount: smartDiscountResult.discountAmount,
              finalPrice: finalEstimateCents / 100,
              triggerRule: smartDiscountResult.reason,
              displayText: smartDiscountResult.displayText,
              griddProfitAfter: griddProfitAfterDiscountUsd(
                platformFeeUsd,
                smartDiscountResult.discountAmount,
              ),
              createdAt: serverTimestamp(),
            });
          } catch {
            /* non-fatal */
          }
        }
        const token = await firebaseAuth?.currentUser?.getIdToken();
        if (token) {
          await fetch(`/api/jobs/${ref.id}/roadside-chat-setup`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
          }).catch(() => null);
          await fetch("/api/ceo-events/job-booked", {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ jobId: ref.id }),
          }).catch(() => null);
        }
        router.push(needsQuote ? `/chat/${ref.id}` : `/track/${ref.id}`);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Could not create booking.");
      } finally {
        setBookingId(null);
      }
    },
    [
      firebaseApp,
      user,
      addressForJob,
      profile,
      profile?.name,
      profile?.zip,
      resolvedZip,
      service,
      meta.label,
      form,
      urgency,
      effectiveEstimateCents,
      finalEstimateCents,
      smartDiscountResult,
      notes,
      router,
      isQuoteRoadside,
      service,
      routeMeters,
      priceIQResult,
    ],
  );

  const getStructuredLocations = useCallback((): {
    pickup: { address: string; lat: number; lng: number };
    dropoff: { address: string; lat: number; lng: number } | null;
  } | null => {
    const f = form as Record<string, unknown>;
    if (service === "ride" || service === "send" || service === "haul") {
      const p = f.pickupCoords as { lat: number; lng: number } | undefined;
      if (!p?.lat) return null;
      const d = f.dropoffCoords as { lat: number; lng: number } | undefined;
      return {
        pickup: { address: String(form.pickup ?? ""), lat: p.lat, lng: p.lng },
        dropoff: d?.lat
          ? { address: String(form.dropoff ?? ""), lat: d.lat, lng: d.lng }
          : null,
      };
    }
    if (service === "roadside" && form.roadsideType === "tow") {
      const a = f.addressCoords as { lat: number; lng: number } | undefined;
      const t = f.towDestinationCoords as { lat: number; lng: number } | undefined;
      if (!a?.lat) return null;
      return {
        pickup: { address: String(form.address ?? ""), lat: a.lat, lng: a.lng },
        dropoff: t?.lat
          ? { address: String(form.towDestination ?? ""), lat: t.lat, lng: t.lng }
          : null,
      };
    }
    const a = f.addressCoords as { lat: number; lng: number } | undefined;
    if (!a?.lat) return null;
    return {
      pickup: { address: String(form.address ?? ""), lat: a.lat, lng: a.lng },
      dropoff: null,
    };
  }, [form, service]);

  const bookOpenMarket = useCallback(async () => {
    if (!firebaseApp || !user) {
      router.push("/?modal=login");
      return;
    }
    const block = getCustomerBookingBlock(profile);
    if (block.blocked) {
      alert(block.message);
      return;
    }
    if (service === "cuts" && !String(form.treeSize ?? "").trim()) {
      alert("Select a tree size to see pricing and book.");
      return;
    }
    if (isQuoteRoadside) {
      alert("This tow needs a provider quote first — use Book on a card above.");
      return;
    }
    const loc = getStructuredLocations();
    if (!loc) {
      alert("Add and resolve a service address (pick a suggestion so the map pins).");
      return;
    }
    const addr = addressForJob();
    if (!addr) {
      alert("Add a complete address to continue.");
      return;
    }
    setBookNowBusy(true);
    try {
      const db = getFirestore(firebaseApp);
      const city = addr.includes(",") ? addr.split(",").slice(-2, -1)[0]?.trim() ?? "Local" : "Local";
      const payCents = finalEstimateCents;
      const subtotalUsd =
        priceIQResult != null
          ? priceIQResult.breakdown.subtotalUsd
          : estimateSubtotalUsdBeforeFee(service, form, urgency, routeMeters);
      const platformFeeUsd =
        priceIQResult != null ? priceIQResult.breakdown.platformFeeUsd : subtotalUsd * 0.15;
      const providerPayoutCents = Math.round((subtotalUsd - platformFeeUsd) * 100);
      const miles =
        typeof routeMeters === "number" && routeMeters > 0 ? metersToMiles(routeMeters) : null;
      const sec = Number(form.routeDurationSeconds ?? 0);
      const estMin =
        sec > 0
          ? sec / 60
          : miles != null
            ? estimateDurationSecondsFromMiles(miles) / 60
            : null;
      const pr = profile as { rating?: number; customerRating?: number } | null;
      const ratingSnap = typeof pr?.rating === "number" ? pr.rating : typeof pr?.customerRating === "number" ? pr.customerRating : 5;
      const bookingDetailsRaw: Record<string, unknown> = {
        ...form,
        urgency,
        ...(typeof routeMeters === "number" ? { routeMeters } : {}),
      };
      const jobPayload: Record<string, unknown> = {
        customerUid: user.uid,
        customerName: profile?.name ?? user.email?.split("@")[0] ?? "Customer",
        customerPhotoUrl: user.photoURL ?? null,
        customerRatingSnapshot: ratingSnap,
        serviceId: service,
        serviceName: meta.label,
        tier: "standard",
        status: "pending",
        city,
        zip: resolvedZip ?? profile?.zip ?? "",
        addressLine: addr,
        pickup: loc.pickup,
        dropoff: loc.dropoff,
        distanceMiles: miles,
        estimatedMinutes: estMin,
        amountCents: payCents,
        providerPayoutCents,
        createdAt: new Date().toISOString(),
        bookingDetails: stripUndefinedDeep(bookingDetailsRaw),
        paymentStatus: "pending",
        payoutStatus: "none",
        customerRatedDriver: false,
        driverRatedCustomer: false,
      };
      if (smartDiscountResult?.eligible) {
        jobPayload.listedPriceCents = effectiveEstimateCents;
        jobPayload.smartDiscountCents = Math.round(smartDiscountResult.discountAmount * 100);
        jobPayload.smartDiscountRule = smartDiscountResult.reason;
      }
      if (notes.trim()) jobPayload.notes = notes.trim();
      const jobData = stripUndefinedDeep(jobPayload) as Record<string, unknown>;
      const ref = await addDoc(collection(db, "jobs"), jobData);
      if (smartDiscountResult?.eligible) {
        try {
          await addDoc(collection(db, "discounts"), {
            customerId: user.uid,
            jobId: ref.id,
            service,
            originalPrice: effectiveEstimateCents / 100,
            discountAmount: smartDiscountResult.discountAmount,
            finalPrice: finalEstimateCents / 100,
            triggerRule: smartDiscountResult.reason,
            displayText: smartDiscountResult.displayText,
            griddProfitAfter: griddProfitAfterDiscountUsd(
              platformFeeUsd,
              smartDiscountResult.discountAmount,
            ),
            createdAt: serverTimestamp(),
          });
        } catch {
          /* non-fatal */
        }
      }
      const token = await firebaseAuth?.currentUser?.getIdToken();
      if (token) {
        await fetch(`/api/jobs/${ref.id}/roadside-chat-setup`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        }).catch(() => null);
        await fetch("/api/ceo-events/job-booked", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobId: ref.id }),
        }).catch(() => null);
      }
      router.push(`/checkout/${ref.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start booking.");
    } finally {
      setBookNowBusy(false);
    }
  }, [
    firebaseApp,
    user,
    profile,
    service,
    meta.label,
    form,
    urgency,
    routeMeters,
    effectiveEstimateCents,
    finalEstimateCents,
    smartDiscountResult,
    notes,
    router,
    isQuoteRoadside,
    addressForJob,
    resolvedZip,
    priceIQResult,
    getStructuredLocations,
  ]);

  function Tab({ id }: { id: ServiceId }) {
    const m = SERVICE_META[id];
    const selected = id === service;
    return (
      <button
        type="button"
        onClick={() => setService(id)}
        className={[
          "shrink-0 rounded-full border px-3 py-2 text-sm transition-colors",
          selected ? "text-[var(--text)]" : "text-[var(--sub)] hover:text-[var(--text)]",
        ].join(" ")}
        style={{
          borderColor: selected ? m.color : "var(--border)",
          background: selected ? `${m.color}22` : "transparent",
        }}
      >
        <span className="mr-2">{m.icon}</span>
        {m.label}
      </button>
    );
  }

  function FieldLabel({ children }: { children: ReactNode }) {
    return <div className="text-xs text-[var(--sub)]">{children}</div>;
  }

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  const urgencyNote =
    urgency === "now" ? "+$15 rush" : urgency === "today" ? "Same day" : "Scheduled window";

  return (
    <main className="min-h-full bg-[#060606] pb-40 pt-16 sm:pb-36 sm:pt-4 lg:pb-44">
      <BackButton href="/home" />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div
          className="rounded-2xl border-l-4 bg-[#0a0a0a] p-5 pl-6"
          style={{ borderColor: meta.color }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs tracking-widest text-[var(--sub)]">BOOK</div>
              <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
                <span className="text-3xl">{meta.icon}</span> {meta.label}
              </h1>
              <p className="mt-1 text-sm text-[var(--sub)]">
                Fill details for a live estimate — matched providers update below.
              </p>
            </div>
            <Card className="hidden min-w-[160px] p-4 lg:block">
              <div className="text-xs text-[var(--sub)]">Estimated</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: meta.color }}>
                {estimateDisplay}
              </div>
              <button
                type="button"
                className="mt-2 text-xs text-[var(--sub)] underline underline-offset-4 hover:text-[var(--text)]"
                onClick={() => setShowBreakdown((v) => !v)}
              >
                {showBreakdown ? "Hide breakdown" : "View breakdown"}
              </button>
              {showBreakdown ? (
                <div className="mt-2 text-xs text-[var(--sub)]">
                  {isQuoteRoadside
                    ? "This job needs a provider quote. After booking we open chat so you can confirm pricing."
                    : `Base + size factors + ${urgencyNote}. Your total is what you pay at checkout.`}
                </div>
              ) : null}
            </Card>
          </div>
        </div>

        <section className="mt-6">
          <div className="text-sm font-semibold text-[var(--text)]">Urgency</div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                { id: "now" as const, emoji: "🔴", label: "Now", sub: "+$15" },
                { id: "today" as const, emoji: "🟡", label: "Today", sub: "Standard" },
                { id: "schedule" as const, emoji: "🟢", label: "Schedule", sub: "Pick a window" },
              ] as const
            ).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUrgency(u.id)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition-colors",
                  urgency === u.id ? "border-[#00FF88] bg-[#00FF88]/10" : "border-[var(--border)] bg-[#0a0a0a]",
                ].join(" ")}
              >
                <div className="text-sm font-medium text-[var(--text)]">
                  {u.emoji} {u.label}
                </div>
                <div className="text-xs text-[var(--sub)]">{u.sub}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="text-sm font-semibold text-[var(--text)]">1) Pick a service</div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {services.map((s) => (
              <Tab key={s.id} id={s.id} />
            ))}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="overflow-visible p-5">
            <div className="text-sm font-semibold text-[var(--text)]">2) Details</div>

            <div className="mt-4 space-y-4">
              {service === "haul" ? (
                <>
                  <div>
                    <FieldLabel>Items description</FieldLabel>
                    <textarea
                      className="mt-2 min-h-[88px] w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#00FF88]"
                      value={String(form.itemsNote ?? "")}
                      onChange={(e) => setForm((p) => ({ ...p, itemsNote: e.target.value }))}
                      placeholder="Sofa, appliances, bags of yard waste…"
                    />
                  </div>
                  <div>
                    <FieldLabel>Weight</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["light", "Light"],
                          ["medium", "Medium"],
                          ["heavy", "Heavy"],
                          ["extra-heavy", "Extra Heavy"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm",
                            form.weight === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, weight: v }))}
                        >
                          <div className="text-[var(--text)]">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>How many items? {String(form.itemsCount ?? 1)}</FieldLabel>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={Number(form.itemsCount ?? 1)}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, itemsCount: Number(e.target.value) }))
                      }
                      className="mt-2 w-full accent-[#00FF88]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      className={[
                        "rounded-xl border px-4 py-3 text-sm",
                        form.stairs ? "border-[#00FF88]" : "border-[var(--border)]",
                      ].join(" ")}
                      onClick={() => setForm((p) => ({ ...p, stairs: !p.stairs }))}
                    >
                      Stairs / floors
                    </button>
                    {form.stairs ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--sub)]">Floors</span>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          className="w-20"
                          value={String(form.stairsFloors ?? 0)}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, stairsFloors: Number(e.target.value) }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BookingLocationSection
                      title="📍 Pickup"
                      value={String(form.pickup ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, pickup: v }))}
                      onResolved={patchResolved("pickupCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                    <BookingLocationSection
                      title="📍 Dropoff"
                      value={String(form.dropoff ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, dropoff: v }))}
                      onResolved={patchResolved("dropoffCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                  </div>
                </>
              ) : null}

              {service === "lawn" ? (
                <>
                  <div>
                    <FieldLabel>Yard size</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["small", "Small (under 0.25 ac)"],
                          ["medium", "Medium"],
                          ["large", "Large"],
                          ["xl", "XL"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm",
                            form.yardSize === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, yardSize: v }))}
                        >
                          <div className="text-[var(--text)]">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Services</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["mow", "Mow"],
                          ["edge", "Edge"],
                          ["blow", "Blow"],
                          ["bags", "Bags"],
                        ] as const
                      ).map(([k, label]) => {
                        const svc = (form.lawnServices as Record<string, boolean>) ?? {};
                        const on = Boolean(svc[k]);
                        return (
                          <button
                            key={k}
                            type="button"
                            className={[
                              "rounded-xl border px-3 py-3 text-left text-sm",
                              on ? "border-[#00FF88]" : "border-[var(--border)]",
                            ].join(" ")}
                            onClick={() =>
                              setForm((p) => {
                                const prev =
                                  (p.lawnServices as Record<string, boolean> | undefined) ?? {};
                                const base = {
                                  mow: true,
                                  edge: true,
                                  blow: true,
                                  bags: false,
                                  ...prev,
                                };
                                return { ...p, lawnServices: { ...base, [k]: !on } };
                              })
                            }
                          >
                            <div className="text-[var(--text)]">
                              {label} {on ? "✓" : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "cuts" ? (
                <>
                  <div>
                    <FieldLabel>Number of trees</FieldLabel>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {(["1", "2", "3", "4", "5+"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-2 py-3 text-center text-sm",
                            form.treeCount === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, treeCount: v }))}
                        >
                          <div className="text-[var(--text)]">{v}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Tree size</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["small", "Small"],
                          ["medium", "Medium"],
                          ["large", "Large"],
                          ["very-large", "Very Large"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm",
                            form.treeSize === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, treeSize: v }))}
                        >
                          <div className="text-[var(--text)]">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={[
                      "w-full rounded-xl border px-3 py-3 text-left text-sm",
                      form.stump ? "border-[#00FF88]" : "border-[var(--border)]",
                    ].join(" ")}
                    onClick={() => setForm((p) => ({ ...p, stump: !p.stump }))}
                  >
                    <div className="text-[var(--text)]">Stump removal</div>
                    <div className="text-xs text-[var(--sub)]">Toggle if needed</div>
                  </button>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "ride" ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BookingLocationSection
                      title="📍 Pickup"
                      value={String(form.pickup ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, pickup: v }))}
                      onResolved={patchResolved("pickupCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                    <BookingLocationSection
                      title="📍 Destination"
                      value={String(form.dropoff ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, dropoff: v }))}
                      onResolved={patchResolved("dropoffCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(
                        [
                          ["standard", "🚗 Standard"],
                          ["xl", "🚙 XL"],
                          ["premium", "⭐ Premium"],
                        ] as const
                      ).map(([v, label]) => {
                        const uRow = uberTiers?.find((r) => r.griddType === v) ?? null;
                        const usd = uRow?.priceIqUsd ?? rideTierPreviewUsd?.[v];
                        return (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm",
                            (form.rideType === v || (v === "premium" && form.rideType === "cargo"))
                              ? "border-[#00FF88]"
                              : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, rideType: v }))}
                        >
                          <div className="text-[var(--text)]">{label}</div>
                          {typeof usd === "number" ? (
                            <div className="mt-1 text-xs font-semibold text-[#00FF88]">
                              {usd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </div>
                          ) : routeLoading || uberEstLoading ? (
                            <div className="mt-1 text-xs text-zinc-500">…</div>
                          ) : (
                            <div className="mt-1 text-xs text-zinc-600">Add route</div>
                          )}
                          {uRow?.etaMinutes != null ? (
                            <div className="mt-0.5 text-[10px] text-zinc-500">
                              ~{uRow.etaMinutes} min to pickup
                            </div>
                          ) : null}
                          {uRow &&
                          uRow.savingsVsUber != null &&
                          uRow.savingsVsUber > 0 &&
                          uRow.uberAvg != null ? (
                            <div className="mt-0.5 text-[10px] font-medium text-[#3dff7a]">
                              Save {uRow.savingsVsUber.toFixed(2)} vs Uber est. ({uRow.uberAvg.toFixed(0)})
                            </div>
                          ) : null}
                        </button>
                        );
                      })}
                    </div>
                    {UBER_BOOKING_ENABLED && uberConn === false ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        <Link href="/profile#uber-connect" className="text-[#3dff7a] underline">
                          Connect your Uber account
                        </Link>{" "}
                        to dispatch a ride on Uber&apos;s network (GRIDD-branded trip in the app).
                      </p>
                    ) : null}
                    {UBER_BOOKING_ENABLED &&
                    uberConn === true &&
                    uberTiers &&
                    (form as { pickupCoords?: { lat: number } }).pickupCoords?.lat != null ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          className="w-full"
                          disabled={
                            uberRequestBusy ||
                            uberEstLoading ||
                            !uberTiers.some((r) => r.productId) ||
                            routeMeters == null
                          }
                          onClick={() => void requestUberNetwork()}
                        >
                          {uberRequestBusy
                            ? "Requesting…"
                            : "Request ride via Uber (network)"}
                        </Button>
                        <p className="mt-1 text-center text-[10px] text-zinc-500">
                          Charged in Uber; this opens a live trip you can follow in{" "}
                          <Link className="text-zinc-400 underline" href="/track">
                            Track
                          </Link>
                          .
                        </p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {service === "pressure" ? (
                <>
                  <div>
                    <FieldLabel>Surface</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(["driveway", "patio", "house", "deck", "all"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm capitalize",
                            form.pressureSurface === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, pressureSurface: v }))}
                        >
                          <div className="text-[var(--text)]">{v}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Approx sq ft</FieldLabel>
                    <Input
                      type="number"
                      value={String(form.sqFt ?? "")}
                      onChange={(e) => setForm((p) => ({ ...p, sqFt: Number(e.target.value) }))}
                      placeholder="800"
                    />
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "send" ? (
                <>
                  <div>
                    <FieldLabel>Package size</FieldLabel>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {(["small", "medium", "large", "xl"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm",
                            form.sendSize === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, sendSize: v }))}
                        >
                          <div className="text-[var(--text)] uppercase">{v}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BookingLocationSection
                      title="📍 Pickup"
                      value={String(form.pickup ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, pickup: v }))}
                      onResolved={patchResolved("pickupCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                    <BookingLocationSection
                      title="📍 Delivery"
                      value={String(form.dropoff ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, dropoff: v }))}
                      onResolved={patchResolved("dropoffCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                  </div>
                </>
              ) : null}

              {service === "help" ? (
                <>
                  <div>
                    <FieldLabel>Help type</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(["loading", "moving", "assembly", "crew"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm capitalize",
                            form.helpType === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, helpType: v }))}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Hours needed</FieldLabel>
                      <Input
                        type="number"
                        value={String(form.helpHours ?? "")}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, helpHours: Number(e.target.value) }))
                        }
                        placeholder="2"
                      />
                    </div>
                    <BookingLocationSection
                      value={String(form.address ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                      onResolved={patchResolved("addressCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                  </div>
                </>
              ) : null}

              {service === "protect" ? (
                <>
                  <div>
                    <FieldLabel>Plan</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(["basic", "pro", "monthly", "business"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm capitalize",
                            form.protectPlan === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, protectPlan: v }))}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "snow" ? (
                <>
                  <div>
                    <FieldLabel>Property type</FieldLabel>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(["driveway", "walkway", "full"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm capitalize",
                            form.snowProperty === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, snowProperty: v }))}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "gutter" ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Home stories</FieldLabel>
                      <Input
                        type="number"
                        value={String(form.gutterStories ?? "")}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, gutterStories: e.target.value }))
                        }
                        placeholder="1"
                      />
                    </div>
                    <button
                      type="button"
                      className={[
                        "rounded-xl border px-3 py-3 text-left text-sm",
                        form.gutterGuards ? "border-[#00FF88]" : "border-[var(--border)]",
                      ].join(" ")}
                      onClick={() => setForm((p) => ({ ...p, gutterGuards: !p.gutterGuards }))}
                    >
                      <div className="text-[var(--text)]">Guard install</div>
                    </button>
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "fence" ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Length (ft)</FieldLabel>
                      <Input
                        type="number"
                        value={String(form.fenceLength ?? "")}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, fenceLength: e.target.value }))
                        }
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <FieldLabel>Material</FieldLabel>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(["wood", "vinyl", "chain"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={[
                              "rounded-xl border px-3 py-3 text-left text-sm capitalize",
                              form.fenceMaterial === v ? "border-[#00FF88]" : "border-[var(--border)]",
                            ].join(" ")}
                            onClick={() => setForm((p) => ({ ...p, fenceMaterial: v }))}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              {service === "roadside" ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#888" }}>
                      🛞 What do you need?
                    </div>
                    {(
                      [
                        {
                          id: "flat_tire",
                          icon: "🛞",
                          label: "Flat Tire Change",
                          price: "$45–$65",
                          desc: "Spare tire swap",
                        },
                        {
                          id: "jump_start",
                          icon: "🔋",
                          label: "Jump Start",
                          price: "$35–$50",
                          desc: "Dead battery",
                        },
                        {
                          id: "lockout",
                          icon: "🔑",
                          label: "Lockout Service",
                          price: "$50–$75",
                          desc: "Locked out of car",
                        },
                        {
                          id: "fuel",
                          icon: "⛽",
                          label: "Fuel Delivery",
                          price: "$25+fuel",
                          desc: "Out of gas",
                        },
                        {
                          id: "tire_replace",
                          icon: "🔧",
                          label: "Tire Replacement",
                          price: "Quote",
                          desc: "Need new tire — provider quotes",
                        },
                        {
                          id: "tow",
                          icon: "🚐",
                          label: "Tow Coordination",
                          price: "Quote",
                          desc: "Need a tow truck",
                        },
                      ] as const
                    ).map((item) => (
                      <div key={item.id}>
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, roadsideType: item.id }))}
                          style={{
                            width: "100%",
                            background:
                              form.roadsideType === item.id ? "#1a0a00" : "#111",
                            border: `1px solid ${
                              form.roadsideType === item.id ? "#FF6B0066" : "#222"
                            }`,
                            borderRadius: 12,
                            padding: "12px 16px",
                            marginBottom: 8,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            textAlign: "left",
                          }}
                        >
                          <span style={{ fontSize: 22 }}>{item.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color:
                                  form.roadsideType === item.id ? "#FF6B00" : "#eee",
                              }}
                            >
                              {item.label}
                            </div>
                            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                              {item.desc}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: item.price === "Quote" ? "#FFB800" : "#00FF88",
                            }}
                          >
                            {item.price}
                          </div>
                        </button>
                        {item.price === "Quote" && form.roadsideType === item.id ? (
                          <div
                            style={{
                              fontSize: 11,
                              color: "#aaa",
                              marginBottom: 8,
                              paddingLeft: 4,
                              lineHeight: 1.4,
                            }}
                          >
                            Provider will quote you directly.
                            <br />
                            <button
                              type="button"
                              onClick={() => scrollToBookingChat()}
                              style={{
                                color: "#3dff7a",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                textDecoration: "underline",
                                font: "inherit",
                              }}
                            >
                              💬 Chat with provider for pricing
                            </button>
                            <br />
                            After booking we&apos;ll open job chat right away.
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {form.roadsideType === "tow" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <BookingLocationSection
                        title="📍 Your location"
                        value={String(form.address ?? "")}
                        onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                        onResolved={patchResolved("addressCoords")}
                        onResolvedZip={(zip) => setResolvedZip(zip)}
                      />
                      <BookingLocationSection
                        title="📍 Tow destination"
                        value={String(form.towDestination ?? "")}
                        onChange={(v) => setForm((p) => ({ ...p, towDestination: v }))}
                        onResolved={patchResolved("towDestinationCoords")}
                        onResolvedZip={(zip) => setResolvedZip(zip)}
                      />
                    </div>
                  ) : (
                    <BookingLocationSection
                      title="📍 Your location"
                      value={String(form.address ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                      onResolved={patchResolved("addressCoords")}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                  )}
                </>
              ) : null}

              {service === "evcharge" ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#888" }}>
                      ⚡ Vehicle Type
                    </div>
                    {(
                      [
                        { id: "tesla", label: "Tesla", icon: "🚗" },
                        { id: "ford", label: "Ford EV", icon: "🚙" },
                        { id: "rivian", label: "Rivian", icon: "🛻" },
                        { id: "chevy", label: "Chevy EV", icon: "🚗" },
                        { id: "other", label: "Other EV", icon: "⚡" },
                      ] as const
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, evType: v.id }))}
                        style={{
                          background: form.evType === v.id ? "#001a2a" : "#111",
                          border: `1px solid ${form.evType === v.id ? "#3B82F666" : "#222"}`,
                          borderRadius: 10,
                          padding: "10px 14px",
                          marginRight: 8,
                          marginBottom: 8,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{v.icon}</span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: form.evType === v.id ? "#3B82F6" : "#888",
                          }}
                        >
                          {v.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#888" }}>
                      🔋 Current Battery %
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={Number(form.batteryPct ?? 15)}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, batteryPct: Number(e.target.value) }))
                      }
                      style={{ width: "100%", accentColor: "#3B82F6" }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        color: "#555",
                        marginTop: 4,
                      }}
                    >
                      <span>0%</span>
                      <span style={{ color: "#3B82F6", fontWeight: 700 }}>
                        Current: {Number(form.batteryPct ?? 15)}%
                      </span>
                      <span>50%</span>
                    </div>
                  </div>
                  <BookingLocationSection
                    title="📍 Your location"
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolved={patchResolved("addressCoords")}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
                </>
              ) : null}

              <div>
                <FieldLabel>Notes (optional)</FieldLabel>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gate code, parking, pets…"
                />
              </div>

              {!isQuoteRoadside ? (
                <div className="mt-6 rounded-2xl border border-[#00FF88]/35 bg-[#07140d] p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#00FF88]">
                    PriceIQ™ — Live estimate
                  </div>
                  {service === "ride" && priceIQResult?.priceIQMetaRide ? (
                    <p className="mt-2 text-xs text-[#3dff7a]">
                      🟢 Live pricing
                      {priceIQResult.priceIQMetaRide.updatedAt
                        ? ` · Updated ${new Date(priceIQResult.priceIQMetaRide.updatedAt).toLocaleTimeString()}`
                        : ""}
                    </p>
                  ) : null}
                  {service === "ride" ? (
                    <p className="mt-1 text-xs text-zinc-400">
                      💚 Always save at least $1.84 vs Uber (or 3.2% on higher fares — whichever saves you more)
                    </p>
                  ) : priceIQResult?.priceIQMetaService?.dailyVerified ? (
                    <p className="mt-2 text-xs text-zinc-400">Prices verified today ✅ · Always 3.2% below market rate</p>
                  ) : null}
                  {service === "ride" &&
                  priceIQResult?.priceIQMetaRide?.isSurging &&
                  priceIQResult.competitorPrice != null &&
                  priceIQResult.savingsUsd != null ? (
                    <p className="mt-2 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
                      🔴 Uber is surging{" "}
                      {(priceIQResult.priceIQMetaRide.surgeMultiplier ?? 1).toFixed(1)}x right now — GRIDD stays flat
                      ✅ You save even more:{" "}
                      {priceIQResult.savingsUsd.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </p>
                  ) : null}
                  {priceIQLoading ? (
                    <p className="mt-2 text-sm text-[var(--sub)]">Calculating…</p>
                  ) : service === "cuts" && !cutsReady ? (
                    <p className="mt-2 text-sm text-[var(--sub)]">Select options to see price</p>
                  ) : priceIQResult ? (
                    <>
                      {smartDiscountResult?.eligible ? (
                        <div
                          className="mt-2 flex items-center justify-between gap-3"
                          style={{
                            background: "rgba(61,255,122,0.08)",
                            border: "1px solid rgba(61,255,122,0.2)",
                            borderRadius: 12,
                            padding: "10px 16px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              color: "#3dff7a",
                              fontWeight: 600,
                            }}
                          >
                            {smartDiscountResult.displayText}
                          </span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: "#3dff7a",
                              fontFamily: "Syne, sans-serif",
                            }}
                          >
                            -$
                            {smartDiscountResult.discountAmount.toFixed(2)}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                        {smartDiscountResult?.eligible ? (
                          <>
                            <span
                              className="text-base"
                              style={{
                                textDecoration: "line-through",
                                color: "#555",
                              }}
                            >
                              {priceIQResult.priceUsd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                            <span className="text-2xl font-bold" style={{ color: "#3dff7a" }}>
                              {(finalEstimateCents / 100).toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </>
                        ) : (
                          <span className="text-2xl font-bold text-[var(--text)]">
                            {priceIQResult.priceUsd.toLocaleString(undefined, {
                              style: "currency",
                              currency: "USD",
                            })}
                          </span>
                        )}
                        <span className="text-xs text-[var(--sub)]">
                          {priceIQResult.miles > 0 ? `📍 ${priceIQResult.miles} mi` : null}
                          {service === "ride" && Number(form.routeDurationSeconds ?? 0) > 0
                            ? ` ⏱️ ~${Math.round(Number(form.routeDurationSeconds) / 60)} min`
                            : null}
                        </span>
                      </div>
                      {priceIQResult.competitorPrice != null &&
                      priceIQResult.savingsUsd != null &&
                      priceIQResult.savingsUsd > 0 ? (
                        <p className="mt-2 text-sm text-[#00FF88]">
                          💚 Save {priceIQResult.savingsUsd.toFixed(2)} vs {priceIQResult.competitorName} (
                          {priceIQResult.competitorPrice.toLocaleString(undefined, {
                            style: "currency",
                            currency: "USD",
                          })}
                          )
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-400">Best price guaranteed ✓</p>
                      )}
                      <button
                        type="button"
                        className="mt-3 text-xs font-semibold text-[#00FF88] underline underline-offset-4"
                        onClick={() => setShowBreakdown((v) => !v)}
                      >
                        {showBreakdown ? "Hide breakdown ›" : "Breakdown ›"}
                      </button>
                      {showBreakdown ? (
                        <div className="mt-3 space-y-1 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">
                          <div className="flex justify-between">
                            <span>Base fare</span>
                            <span>
                              {priceIQResult.breakdown.baseFare.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </div>
                          {priceIQResult.breakdown.miles > 0 ||
                          priceIQResult.breakdown.distanceCharge > 0 ? (
                            <div className="flex justify-between">
                              <span>
                                Distance ({priceIQResult.breakdown.miles} mi ×{" "}
                                {priceIQResult.breakdown.perMileRate.toFixed(2)})
                              </span>
                              <span>
                                {priceIQResult.breakdown.distanceCharge.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: "USD",
                                })}
                              </span>
                            </div>
                          ) : null}
                          {priceIQResult.breakdown.timeCharge !== 0 ? (
                            <div className="flex justify-between">
                              <span>{service === "cuts" ? "Urgency / adjustments" : "Time"}</span>
                              <span>
                                {priceIQResult.breakdown.timeCharge.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: "USD",
                                })}
                              </span>
                            </div>
                          ) : null}
                          {priceIQResult.breakdown.extraCharge > 0 ? (
                            <div className="flex justify-between">
                              <span>{service === "ride" ? "Booking fee" : "Extras"}</span>
                              <span>
                                {priceIQResult.breakdown.extraCharge.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: "USD",
                                })}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex justify-between border-t border-white/10 pt-2 text-[var(--sub)]">
                            <span>Subtotal</span>
                            <span>
                              {priceIQResult.breakdown.subtotalUsd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>
                              Platform fee ({Math.round(priceIQResult.breakdown.platformFeePct * 100)}%)
                            </span>
                            <span>
                              {priceIQResult.breakdown.platformFeeUsd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Provider receives</span>
                            <span>
                              {(
                                priceIQResult.breakdown.subtotalUsd -
                                priceIQResult.breakdown.platformFeeUsd
                              ).toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>GRIDD fee</span>
                            <span>
                              {priceIQResult.breakdown.platformFeeUsd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold text-white">
                            <span>GRIDD total</span>
                            <span>
                              {priceIQResult.breakdown.griddTotalUsd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </div>
                          {priceIQResult.breakdown.uberEstimateUsd != null ? (
                            <>
                              <div className="mt-2 border-t border-white/10 pt-2 text-[var(--sub)]">
                                {priceIQResult.competitorName} estimate:{" "}
                                {priceIQResult.breakdown.uberEstimateUsd.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: "USD",
                                })}
                              </div>
                              {priceIQResult.breakdown.youSaveUsd != null &&
                              priceIQResult.breakdown.youSaveUsd > 0 ? (
                                <div className="text-[#00FF88]">
                                  You save:{" "}
                                  {priceIQResult.breakdown.youSaveUsd.toLocaleString(undefined, {
                                    style: "currency",
                                    currency: "USD",
                                  })}{" "}
                                  💚
                                </div>
                              ) : null}
                            </>
                          ) : null}
                          <div className="mt-2 border-t border-white/10 pt-2 font-semibold text-[#00FF88]">
                            You pay:{" "}
                            {smartDiscountResult?.eligible ? (
                              <span>
                                <span
                                  className="font-normal line-through opacity-60"
                                  style={{ color: "#888" }}
                                >
                                  {priceIQResult.priceUsd.toLocaleString(undefined, {
                                    style: "currency",
                                    currency: "USD",
                                  })}
                                </span>{" "}
                                <span className="text-[#3dff7a]">
                                  {(finalEstimateCents / 100).toLocaleString(undefined, {
                                    style: "currency",
                                    currency: "USD",
                                  })}
                                </span>
                              </span>
                            ) : (
                              priceIQResult.priceUsd.toLocaleString(undefined, {
                                style: "currency",
                                currency: "USD",
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-[var(--sub)]">
                      <p>
                        Enter a valid ZIP and route (where needed) for PriceIQ™. Classic estimate:{" "}
                        {smartDiscountResult?.eligible ? (
                          <>
                            <span
                              className="line-through opacity-70"
                              style={{ color: "#555" }}
                            >
                              {money(effectiveEstimateCents)}
                            </span>{" "}
                            <span className="font-bold text-[#3dff7a]">{money(finalEstimateCents)}</span>
                          </>
                        ) : (
                          money(effectiveEstimateCents)
                        )}
                      </p>
                      {smartDiscountResult?.eligible ? (
                        <p className="mt-2 text-xs font-semibold text-[#3dff7a]">
                          {smartDiscountResult.displayText} (−{money(Math.round(smartDiscountResult.discountAmount * 100))})
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              {user ? (
                <BookingJobChat
                  chatJobId={previewChatJobId(user.uid)}
                  customerUid={user.uid}
                  providerLabel={topProvider?.name ?? "Your provider"}
                  selectedProviderUid={topProvider?.uid}
                  chatTitle="💬 Chat with provider"
                />
              ) : null}
            </div>
          </Card>

          <Card className="h-fit p-5">
            <div className="text-sm font-semibold text-[var(--text)]">3) Providers for this service</div>
            <div className="mt-1 text-xs text-[var(--sub)]">
              Sorted by rating, distance estimate, and tier.
            </div>

            {providersLoading ? (
              <div className="mt-4 space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
              </div>
            ) : providers.length === 0 ? (
              <div className="mt-4 text-sm text-[var(--sub)]">No matched providers yet.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {providers.map((p) => (
                  <div key={p.uid} className="rounded-2xl border border-[var(--border)] bg-[#0a0a0a] p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-white/5 text-xs font-semibold"
                        style={{
                          backgroundImage: p.photoUrl ? `url(${p.photoUrl})` : undefined,
                          backgroundSize: "cover",
                        }}
                      >
                        {!p.photoUrl ? (p.name?.slice(0, 2)?.toUpperCase() ?? "PR") : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[var(--text)]">{p.name}</div>
                        <div className="mt-1 text-xs text-[var(--sub)]">
                          {(p.rating ?? 0).toFixed(1)}★ · ~{p.etaMinutes}m · {p.driverTier ?? "starter"}{" "}
                          tier
                        </div>
                      </div>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      type="button"
                      disabled={bookingId === p.uid}
                      onClick={() => void bookWithProvider(p)}
                    >
                      {bookingId === p.uid
                        ? "Booking…"
                        : isQuoteRoadside
                          ? `Book ${p.name} — chat for quote`
                          : `Book ${p.name} — ${money(finalEstimateCents)}`}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>

      <div className="fixed bottom-14 left-0 right-0 z-40 border-t border-[var(--border)] bg-[#060606]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--sub)]">Live estimate</div>
            <div className="text-2xl font-bold" style={{ color: meta.color }}>
              {estimateDisplay}
            </div>
          </div>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] text-sm text-[#00FF88] underline underline-offset-4"
            onClick={() => setShowBreakdown((v) => !v)}
          >
            {showBreakdown ? "Hide" : "Breakdown"}
          </button>
        </div>
        {showBreakdown ? (
          <p className="mx-auto mt-2 max-w-6xl text-xs text-[var(--sub)]">
            Base + size + {urgencyNote}.
          </p>
        ) : null}
        {user && !isQuoteRoadside && cutsReady ? (
          <div className="mx-auto mt-3 max-w-6xl">
            <button
              type="button"
              disabled={
                bookNowBusy || (needsRouteForEstimate && (routeMeters == null || routeMeters <= 0))
              }
              onClick={() => void bookOpenMarket()}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 px-4 text-base font-bold text-white shadow-lg shadow-orange-900/30 transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>⚡</span>
              {bookNowBusy ? "Preparing…" : `Book now — ${money(finalEstimateCents)}`}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-zinc-500">
              Pay securely, then we notify drivers to accept your job.
            </p>
          </div>
        ) : null}
      </div>

      <CustomerNav />
    </main>
  );
}

export default function CustomerBookPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-full bg-[#060606] px-6 py-10">
          <p className="text-sm text-[var(--sub)]">Loading booking…</p>
        </main>
      }
    >
      <CustomerBookInner />
    </Suspense>
  );
}
