"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, getFirestore } from "firebase/firestore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { services } from "@/constants";
import type { Provider } from "@/types";
import type { DriverTier } from "@/types";
import type { Urgency } from "@/types/booking";
import { firebaseApp } from "@/lib/firebase";
import { BookingLocationSection } from "@/components/booking/BookingLocationSection";
import { BackButton } from "@/components/BackButton";
import { CustomerNav } from "@/components/CustomerNav";
import { estimateCentsForService } from "@/lib/booking-estimate";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/hooks/useAuth";

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
    treeSize: "medium",
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
  });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("today");
  const [providers, setProviders] = useState<MatchedProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [resolvedZip, setResolvedZip] = useState<string | undefined>();

  const meta = SERVICE_META[service];

  useEffect(() => {
    setService(initialService);
  }, [initialService]);

  useEffect(() => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("service", service);
    router.replace(`/book?${sp.toString()}`);
  }, [service, params, router]);

  const estimate = useMemo(
    () => estimateCentsForService(service, form, urgency),
    [service, form, urgency],
  );

  const isQuoteRoadside = useMemo(
    () =>
      service === "roadside" &&
      (form.roadsideType === "tire_replace" || form.roadsideType === "tow"),
    [service, form.roadsideType],
  );

  const estimateDisplay = isQuoteRoadside ? "Quote" : money(estimate);

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
    if (service === "ride" || service === "send") {
      const a = [String(form.pickup ?? ""), String(form.dropoff ?? "")].filter(Boolean).join(" → ");
      return a.trim();
    }
    return String(form.address ?? "").trim();
  }, [form, service]);

  const bookWithProvider = useCallback(
    async (p: MatchedProvider) => {
      if (!firebaseApp || !user) {
        router.push("/login");
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
        const payCents = needsQuote ? 0 : estimate;
        const ref = await addDoc(collection(db, "jobs"), {
          customerUid: user.uid,
          customerName: profile?.name ?? user.email?.split("@")[0] ?? "Customer",
          serviceId: service,
          serviceName: meta.label,
          tier: "standard",
          status: "pending",
          city,
          zip: resolvedZip ?? profile?.zip,
          addressLine: addr,
          amountCents: payCents,
          providerPayoutCents: needsQuote ? 0 : Math.round(estimate * 0.85),
          providerUid: p.uid,
          providerName: p.name,
          providerRating: p.rating,
          providerPhotoUrl: p.photoUrl,
          createdAt: new Date().toISOString(),
          bookingDetails: { ...form, urgency, needsQuote: needsQuote || undefined },
          paymentStatus: needsQuote ? "quote_pending" : "pending",
          payoutStatus: "none",
          notes: notes.trim() || undefined,
        });
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
      profile?.name,
      profile?.zip,
      resolvedZip,
      service,
      meta.label,
      form,
      urgency,
      estimate,
      notes,
      router,
      isQuoteRoadside,
    ],
  );

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
    <main className="min-h-full bg-[#060606] pb-40 pt-16 sm:pb-36 sm:pt-4 lg:pb-28">
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
          <Card className="p-5">
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
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
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
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                    <BookingLocationSection
                      title="📍 Destination"
                      value={String(form.dropoff ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, dropoff: v }))}
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Type</FieldLabel>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(["standard", "xl", "cargo"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={[
                            "rounded-xl border px-3 py-3 text-left text-sm",
                            form.rideType === v ? "border-[#00FF88]" : "border-[var(--border)]",
                          ].join(" ")}
                          onClick={() => setForm((p) => ({ ...p, rideType: v }))}
                        >
                          <div className="text-[var(--text)] capitalize">{v}</div>
                        </button>
                      ))}
                    </div>
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
                      onResolvedZip={(zip) => setResolvedZip(zip)}
                    />
                    <BookingLocationSection
                      title="📍 Delivery"
                      value={String(form.dropoff ?? "")}
                      onChange={(v) => setForm((p) => ({ ...p, dropoff: v }))}
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
                            <span style={{ color: "#00FF88" }}>💬 Chat with provider for pricing</span>
                            <br />
                            After booking we&apos;ll open job chat right away.
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <BookingLocationSection
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
                    onResolvedZip={(zip) => setResolvedZip(zip)}
                  />
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
                    value={String(form.address ?? "")}
                    onChange={(v) => setForm((p) => ({ ...p, address: v }))}
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
                          : `Book ${p.name} — ${money(estimate)}`}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>

      <div className="fixed bottom-14 left-0 right-0 z-40 border-t border-[var(--border)] bg-[#060606]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:bottom-0 lg:hidden">
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
