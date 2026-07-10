"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";
import type { Job, Provider } from "@/types";
import { jobBookingCoords } from "@/lib/admin-dashboard-stats";
import { serviceMeta } from "@/lib/driver-service-meta";

export type GriddEyeFilter = "all" | "drivers" | "jobs" | "customers";

const mapContainerStyle = { width: "100%", height: "min(70vh, 640px)" };
const defaultCenter = { lat: 39.8283, lng: -98.5795 };

function svgMarkerDataUrl(hex: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="10" fill="${hex}" stroke="#0a0a0a" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const ICON = {
  green: svgMarkerDataUrl("#22c55e"),
  red: svgMarkerDataUrl("#ef4444"),
  blue: svgMarkerDataUrl("#3b82f6"),
  yellow: svgMarkerDataUrl("#eab308"),
};

type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  dot: "green" | "red" | "blue" | "yellow";
};

function buildMarkers(providers: Provider[], jobs: Job[]): MapPoint[] {
  const out: MapPoint[] = [];

  for (const p of providers) {
    if (!p.isOnline || !p.location?.lat || !p.location?.lng) continue;
    out.push({
      id: `d-${p.uid}`,
      lat: p.location.lat,
      lng: p.location.lng,
      title: p.name ?? "Driver",
      subtitle: `★ ${(p.rating ?? 0).toFixed(1)} · ${p.activeJob ? `Job ${p.activeJob}` : "Available"}`,
      dot: "green",
    });
  }

  const activeStatuses = new Set(["active", "assigned", "en_route", "arrived", "in_progress"]);

  for (const j of jobs) {
    const c = jobBookingCoords(j);
    if (!c) continue;
    const meta = serviceMeta(j.serviceId, j.serviceName);
    if (activeStatuses.has(j.status)) {
      out.push({
        id: `j-${j.id}`,
        lat: c.lat,
        lng: c.lng,
        title: `${meta.label} · ${j.id.slice(0, 8)}…`,
        subtitle: `${j.customerName ?? "Customer"} → ${j.providerName ?? "—"} · ${j.status}`,
        dot: "red",
      });
      continue;
    }
    if (j.status === "pending" || j.status === "requested") {
      const bd = j.bookingDetails as Record<string, unknown> | undefined;
      const urgent = bd?.urgency === "now" || bd?.urgency === "urgent";
      out.push({
        id: `p-${j.id}`,
        lat: c.lat,
        lng: c.lng,
        title: `${meta.label} · ${j.id.slice(0, 8)}…`,
        subtitle: `${j.customerName ?? "Customer"} · ${urgent ? "Booking now" : "Pending"}`,
        dot: urgent ? "blue" : "yellow",
      });
    }
  }

  return out;
}

function zipHeatmap(jobs: Job[]): { zip: string; count: number; level: "high" | "med" | "low" }[] {
  const map = new Map<string, number>();
  const day = Date.now() - 24 * 60 * 60 * 1000;
  for (const j of jobs) {
    const t = new Date(j.createdAt).getTime();
    if (t < day) continue;
    const z = (j.zip ?? "").trim() || "—";
    map.set(z, (map.get(z) ?? 0) + 1);
  }
  const rows = [...map.entries()].map(([zip, count]) => ({ zip, count }));
  rows.sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.slice(0, 24).map((r) => ({
    ...r,
    level: r.count >= max * 0.66 ? "high" : r.count >= max * 0.33 ? "med" : "low",
  }));
}

function filterPoints(points: MapPoint[], filter: GriddEyeFilter): MapPoint[] {
  if (filter === "all") return points;
  if (filter === "drivers") return points.filter((p) => p.dot === "green");
  if (filter === "jobs") return points.filter((p) => p.dot === "red" || p.dot === "blue" || p.dot === "yellow");
  /* customers: pending / booking markers */
  return points.filter((p) => p.dot === "blue" || p.dot === "yellow");
}

type Props = {
  providers: Provider[];
  jobs: Job[];
  filter: GriddEyeFilter;
  onFilterChange: (f: GriddEyeFilter) => void;
};

export function AdminGriddEyeTab({ providers, jobs, filter, onFilterChange }: Props) {
  const points = useMemo(() => filterPoints(buildMarkers(providers, jobs), filter), [providers, jobs, filter]);
  const [info, setInfo] = useState<{ lat: number; lng: number; title: string; subtitle: string } | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const heat = useMemo(() => zipHeatmap(jobs), [jobs]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "gridd-admin-eye",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  const onLoad = useCallback((m: google.maps.Map) => setMap(m), []);
  const onUnmount = useCallback(() => setMap(null), []);

  const center = useMemo(() => {
    if (points.length === 0) return defaultCenter;
    const lat = points.reduce((s, x) => s + x.lat, 0) / points.length;
    const lng = points.reduce((s, x) => s + x.lng, 0) / points.length;
    return { lat, lng };
  }, [points]);

  const fitBounds = useCallback(() => {
    if (!map || !window.google?.maps || points.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const x of points) bounds.extend({ lat: x.lat, lng: x.lng });
    map.fitBounds(bounds, 48);
  }, [map, points]);

  useEffect(() => {
    if (map && points.length > 0) fitBounds();
  }, [map, filter, points.length, fitBounds]);

  const iconFor = (dot: MapPoint["dot"]) => {
    const url = dot === "green" ? ICON.green : dot === "red" ? ICON.red : dot === "blue" ? ICON.blue : ICON.yellow;
    return typeof google !== "undefined"
      ? { url, scaledSize: new google.maps.Size(28, 28) }
      : { url };
  };

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
        Map failed to load. Set NEXT_PUBLIC_GOOGLE_MAPS_KEY.
      </p>
    );
  }

  if (!isLoaded) {
    return <div className="h-[min(70vh,640px)] animate-pulse rounded-2xl bg-zinc-900" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "drivers", "jobs", "customers"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              onFilterChange(f);
              setInfo(null);
            }}
            className={[
              "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize",
              filter === f ? "border-[#3dff7a]/50 bg-[#3dff7a]/10 text-[#3dff7a]" : "border-zinc-800 text-zinc-500",
            ].join(" ")}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fitBounds()}
          className="ml-auto rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400"
        >
          Fit
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#1e1e1e]">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={points.length === 0 ? 4 : 11}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            fullscreenControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            styles: [
              { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
              { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
              { elementType: "labels.text.fill", stylers: [{ color: "#888" }] },
            ],
          }}
          onClick={() => setInfo(null)}
        >
          {points.map((pt) => (
            <Marker
              key={pt.id}
              position={{ lat: pt.lat, lng: pt.lng }}
              icon={iconFor(pt.dot)}
              onClick={() => setInfo({ lat: pt.lat, lng: pt.lng, title: pt.title, subtitle: pt.subtitle })}
            />
          ))}
          {info ? (
            <InfoWindow position={{ lat: info.lat, lng: info.lng }} onCloseClick={() => setInfo(null)}>
              <div className="max-w-xs pr-2 text-black">
                <div className="font-semibold">{info.title}</div>
                <div className="mt-1 text-sm text-zinc-600">{info.subtitle}</div>
              </div>
            </InfoWindow>
          ) : null}
        </GoogleMap>
      </div>

      <div className="rounded-2xl border border-[#1e1e1e] bg-[#111] p-4">
        <h3 className="text-sm font-semibold text-zinc-200">ZIP demand (24h)</h3>
        <p className="mt-1 text-xs text-zinc-500">Red = high · Orange = medium · Green = low</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {heat.length === 0 ? (
            <span className="text-zinc-500">No ZIP data yet.</span>
          ) : (
            heat.map((h) => (
              <span
                key={h.zip}
                className="rounded-full px-2 py-1 font-mono text-[11px]"
                style={{
                  background:
                    h.level === "high" ? "rgba(239,68,68,0.25)" : h.level === "med" ? "rgba(234,88,12,0.25)" : "rgba(34,197,94,0.2)",
                  color: h.level === "high" ? "#fca5a5" : h.level === "med" ? "#fdba74" : "#86efac",
                }}
              >
                {h.zip} · {h.count}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" /> Drivers online
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" /> Active jobs
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-[#3b82f6]" /> Booking now
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-[#eab308]" /> Pending
        </span>
      </div>
    </div>
  );
}
