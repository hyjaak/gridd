"use client";

import { useCallback, useState } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Called when we resolve a ZIP from geocoding (current location or manual geocode). */
  onResolvedZip?: (zip: string) => void;
  /** Section heading (default single location line). */
  title?: string;
};

export function BookingLocationSection({ value, onChange, onResolvedZip, title = "📍 Location" }: Props) {
  const [locationLoading, setLocationLoading] = useState(false);

  const getCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`,
          );
          const data = (await res.json()) as {
            results?: Array<{
              formatted_address?: string;
              address_components?: Array<{ long_name: string; types: string[] }>;
            }>;
          };
          const first = data.results?.[0];
          if (first?.formatted_address) {
            onChange(first.formatted_address);
            const zip = first.address_components?.find((c) => c.types.includes("postal_code"))
              ?.long_name;
            if (zip) onResolvedZip?.(zip);
          }
        } finally {
          setLocationLoading(false);
        }
      },
      () => {
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [onChange, onResolvedZip]);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 8,
          color: "#888",
        }}
      >
        {title}
      </div>

      <button
        type="button"
        onClick={getCurrentLocation}
        style={{
          width: "100%",
          background: "#0a1a0a",
          border: "1px solid #00FF8833",
          borderRadius: 12,
          padding: "12px 16px",
          color: "#00FF88",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span>📍</span>
        {locationLoading ? "Getting location..." : "Use My Current Location"}
      </button>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or enter address manually..."
        style={{
          width: "100%",
          background: "#111",
          border: `1px solid ${value ? "#00FF8844" : "#222"}`,
          borderRadius: 12,
          padding: "12px 16px",
          color: "#eee",
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {value ? (
        <div
          style={{
            fontSize: 11,
            color: "#00FF88",
            marginTop: 4,
            paddingLeft: 4,
          }}
        >
          ✓ Location set
        </div>
      ) : null}
    </div>
  );
}
