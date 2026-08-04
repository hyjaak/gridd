"use client";

import { useState } from "react";
import type { MarketKey } from "@/lib/constants";
import { MARKETS } from "@/lib/constants";
import { reverseGeocode } from "@/lib/dispatch-geo";

type Props = {
  label: string;
  street: string;
  city: string;
  unit: string;
  notes: string;
  onStreetChange: (val: string) => void;
  onCityChange: (val: string) => void;
  onUnitChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  market: MarketKey;
  onGeoSelect?: (geo: { lat: number; lng: number }) => void;
};

export default function StopAddressInput({
  label,
  street,
  city,
  unit,
  notes,
  onStreetChange,
  onCityChange,
  onUnitChange,
  onNotesChange,
  market,
  onGeoSelect,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState(false);

  const towns = MARKETS[market].towns;
  const cityOptions = [...towns, "Other (we'll confirm)"];

  const useMyLocation = async () => {
    if (!("geolocation" in navigator)) { setLocErr(true); return; }
    setLocating(true);
    setLocErr(false);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      const { latitude, longitude } = pos.coords;
      const label = await reverseGeocode(latitude, longitude);
      if (label) {
        onStreetChange(label);
        onGeoSelect?.({ lat: latitude, lng: longitude });
      } else {
        setLocErr(true);
      }
    } catch {
      // Silent on deny / failure — user keeps typing.
      setLocErr(true);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="flex-1">
      <div className="text-[12px] font-bold text-[#5c6a62] mb-1">{label}</div>
      <input
        type="text"
        value={street}
        onChange={(e) => onStreetChange(e.target.value)}
        placeholder="Street address"
        className="w-full border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="text-[12px] text-[#0e9f6e] font-bold hover:underline mb-2 disabled:opacity-50"
      >
        {locating ? "Locating…" : "📍 Use my location"}
      </button>
      {locErr && (
        <div className="text-[11px] text-[#5c6a62] font-semibold mb-2">Couldn't get location — just type it.</div>
      )}
      <select
        value={city}
        onChange={(e) => onCityChange(e.target.value)}
        className="w-full border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
      >
        <option value="">Select city</option>
        {cityOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {!showDetails ? (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="text-[12px] text-[#0e9f6e] font-bold hover:underline mb-2"
        >
          + Add details
        </button>
      ) : (
        <>
          <input
            type="text"
            value={unit}
            onChange={(e) => onUnitChange(e.target.value)}
            placeholder="Apt/unit/suite (optional)"
            className="w-full border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
          />
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Anything we should know? (gate code, stairs, loading dock, parking)"
            rows={2}
            className="w-full border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 resize-vertical min-h-[60px] focus:outline-none focus:border-[#0e9f6e]"
          />
          <button
            type="button"
            onClick={() => setShowDetails(false)}
            className="text-[12px] text-[#5c6a62] font-bold hover:underline mb-2"
          >
            - Hide details
          </button>
        </>
      )}
    </div>
  );
}