"use client";

import { useState, useRef, useEffect } from "react";
import type { MarketKey } from "@/lib/constants";
import type { AddressSuggestion } from "@/lib/dispatch-geo";
import { searchAddress } from "@/lib/dispatch-geo";
import { MARKETS } from "@/lib/constants";

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
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const towns = MARKETS[market].towns;
  const cityOptions = [...towns, "Other (we'll confirm)"];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleStreetInput = (val: string) => {
    onStreetChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchAddress(val, market);
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 350);
  };

  const handleSelect = (s: AddressSuggestion) => {
    onStreetChange(s.label);
    onGeoSelect?.({ lat: s.lat, lng: s.lng });
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="flex-1 relative">
      <div className="text-[12px] font-bold text-[#5c6a62] mb-1">{label}</div>
      <input
        type="text"
        value={street}
        onChange={(e) => handleStreetInput(e.target.value)}
        placeholder="Street address"
        className="w-full border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-[calc(100%-8px)] left-0 right-0 z-50 bg-white border border-black/12 rounded-xl shadow-lg max-h-[220px] overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat}-${s.lng}-${i}`}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2.5 text-[13px] text-[#5c6a62] hover:bg-[#f2faf6] hover:text-[#101613] transition-colors border-b border-black/6 last:border-b-0"
            >
              {s.label}
            </button>
          ))}
        </div>
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
