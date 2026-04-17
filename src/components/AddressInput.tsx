"use client";

import { useCallback, useEffect } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";

const libraries = ["places"] as ("places")[];

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type AddressResolved = {
  formattedAddress: string;
  zip?: string;
  lat: number;
  lng: number;
};

type AddressInputProps = {
  value: string;
  onChange: (v: string) => void;
  onResolved?: (info: AddressResolved) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
};

export function AddressInput({
  value,
  onChange,
  onResolved,
  placeholder = "Enter address…",
  className,
  id,
  disabled,
}: AddressInputProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "gridd-google-maps",
    googleMapsApiKey: apiKey,
    libraries,
  });

  const {
    ready,
    value: acValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    requestOptions: { componentRestrictions: { country: "us" } },
    debounce: 300,
    initOnMount: false,
  });

  useEffect(() => {
    if (isLoaded) init();
  }, [isLoaded, init]);

  useEffect(() => {
    setValue(value, false);
  }, [value, setValue]);

  const pick = useCallback(
    async (description: string) => {
      try {
        const results = await getGeocode({ address: description });
        const first = results[0];
        if (!first) return;
        const { lat, lng } = await getLatLng(first);
        const formatted = first.formatted_address ?? description;
        const zip = first.address_components?.find((c) =>
          c.types.includes("postal_code"),
        )?.long_name;
        setValue(formatted, false);
        clearSuggestions();
        onChange(formatted);
        onResolved?.({ formattedAddress: formatted, zip, lat, lng });
      } catch {
        setValue(description, false);
        onChange(description);
      }
    },
    [clearSuggestions, onChange, onResolved, setValue],
  );

  if (loadError || !apiKey) {
    return (
      <input
        id={id}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#00FF88]",
          className,
        )}
      />
    );
  }

  if (!isLoaded) {
    return (
      <input
        id={id}
        disabled
        value={value}
        readOnly
        placeholder="Loading address search…"
        className={cn(
          "w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-2 text-sm text-[var(--sub)]",
          className,
        )}
      />
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        disabled={disabled || !ready}
        value={acValue}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          onChange(v);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#00FF88]",
          className,
        )}
      />
      {status === "OK" && data.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[#0a0a0a] py-1 text-sm shadow-xl"
          role="listbox"
        >
          {data.map(({ place_id, description }) => (
            <li key={place_id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-[var(--text)] hover:bg-white/5"
                onClick={() => void pick(description)}
              >
                {description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
