"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MarketKey } from "@/lib/constants";
import type { AddressSuggestion } from "@/lib/dispatch-geo";
import { searchAddress } from "@/lib/dispatch-geo";

type Props = {
  value: string;
  onChange: (val: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder: string;
  market: MarketKey;
};

export default function AddressInput({
  value,
  onChange,
  onSelect,
  placeholder,
  market,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleInput = useCallback(
    (val: string) => {
      onChange(val);
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
    },
    [onChange, market]
  );

  const handleSelect = (s: AddressSuggestion) => {
    onChange(s.label);
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="flex-1 relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        placeholder={placeholder}
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
    </div>
  );
}