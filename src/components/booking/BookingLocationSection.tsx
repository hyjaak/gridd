"use client";

import { AddressInput, type AddressResolved } from "@/components/AddressInput";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** ZIP when resolved from Places or current location. */
  onResolvedZip?: (zip: string) => void;
  /** Full resolution including coordinates for routing / estimates. */
  onResolved?: (info: AddressResolved | null) => void;
  title?: string;
  showCurrentLocationButton?: boolean;
};

export function BookingLocationSection({
  value,
  onChange,
  onResolvedZip,
  onResolved,
  title = "📍 Location",
  showCurrentLocationButton = true,
}: Props) {
  return (
    <div className="relative z-[1] mb-4 overflow-visible">
      <div className="mb-2 text-[13px] font-bold text-zinc-500">{title}</div>
      <AddressInput
        value={value}
        onChange={onChange}
        showCurrentLocationButton={showCurrentLocationButton}
        onResolved={(info) => {
          onResolved?.(info);
          if (info?.zip) onResolvedZip?.(info.zip);
        }}
        placeholder="Start typing an address…"
        className="border-zinc-700"
      />
      {value.trim() ? (
        <div className="mt-1 pl-1 text-[11px] text-[#00FF88]">✓ Location set</div>
      ) : null}
    </div>
  );
}
