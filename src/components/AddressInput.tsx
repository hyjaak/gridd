"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { nominatimHitToResolved, type NominatimSearchHit } from "@/lib/nominatim";

const libraries = ["places"] as ("places")[];

/** Nominatim search debounce — fewer requests, time for results to return */
const NOMINATIM_DEBOUNCE_MS = 400;
const DEFAULT_MIN_CHARS = 3;

const suggestionDropdownClass =
  "absolute left-0 right-0 top-full z-[9999] mt-1 max-h-72 w-full list-none overflow-auto rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] py-0 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.5)]";

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const suggestionItemClass =
  "flex min-h-[52px] w-full cursor-pointer select-none items-center gap-2.5 border-b border-[#1e1e1a] px-4 py-3.5 text-left [-webkit-tap-highlight-color:transparent] last:border-b-0 hover:bg-white/5 active:bg-[#1a1a1a]";

function SuggestionPrimarySub({ primary, sub }: { primary: string; sub: string }) {
  return (
    <>
      <span className="flex-shrink-0 text-base" aria-hidden>
        📍
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug text-[var(--text)]">{primary}</div>
        {sub ? <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{sub}</div> : null}
      </div>
    </>
  );
}

function splitGoogleDescription(description: string): { primary: string; sub: string } {
  const idx = description.indexOf(",");
  if (idx === -1) return { primary: description.trim(), sub: "" };
  return {
    primary: description.slice(0, idx).trim(),
    sub: description.slice(idx + 1).trim(),
  };
}

function splitNominatimHit(hit: NominatimHit): { primary: string; sub: string } {
  const full = hit.formattedLine ?? nominatimHitToResolved(hit).formattedAddress;
  const parts = full.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0 && hit.display_name) {
    const dn = hit.display_name.split(",").map((s) => s.trim());
    return {
      primary: dn[0] ?? "",
      sub: dn.slice(1, 4).join(", "),
    };
  }
  return {
    primary: parts[0] ?? full,
    sub: parts.slice(1, 3).join(", "),
  };
}

/** Avoid double-invoke when both touch and mouse fire. */
function usePickDedupe() {
  const lastAt = useRef(0);
  return useCallback((fn: () => void) => {
    const now = Date.now();
    if (now - lastAt.current < 350) return;
    lastAt.current = now;
    fn();
  }, []);
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
  onResolved?: (info: AddressResolved | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  minCharsForSuggestions?: number;
  showClearButton?: boolean;
  showCurrentLocationButton?: boolean;
};

type NominatimHit = NominatimSearchHit & { formattedLine?: string };

function useDebouncedNominatimSearch(query: string, minChars: number, enabled: boolean) {
  const [results, setResults] = useState<NominatimHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < minChars) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/maps/nominatim?q=${encodeURIComponent(q)}`);
        const j = (await res.json().catch(() => null)) as { ok?: boolean; results?: NominatimHit[] } | null;
        const list = Array.isArray(j?.results) ? j.results : [];
        if (!cancelled) {
          if (res.ok && j?.ok !== false) {
            setResults(list);
          } else {
            setResults([]);
          }
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, NOMINATIM_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, minChars, enabled]);

  return { results, loading };
}

async function reverseGeocodeGoogle(lat: number, lng: number, apiKey: string): Promise<AddressResolved | null> {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`,
  );
  const data = (await res.json()) as {
    results?: Array<{
      formatted_address?: string;
      address_components?: Array<{ long_name: string; types: string[] }>;
    }>;
  };
  const first = data.results?.[0];
  if (!first?.formatted_address) return null;
  const zip = first.address_components?.find((c) => c.types.includes("postal_code"))?.long_name;
  return {
    formattedAddress: first.formatted_address,
    zip,
    lat,
    lng,
  };
}

async function reverseGeocodeNominatim(lat: number, lng: number): Promise<AddressResolved | null> {
  const res = await fetch(`/api/maps/nominatim?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`);
  const j = (await res.json()) as {
    ok?: boolean;
    result?: { formattedAddress: string; zip?: string; lat: number; lng: number } | null;
  };
  if (!j.ok || !j.result) return null;
  return j.result;
}

function useBlurHideDelay(hide: () => void) {
  const blurHideRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (blurHideRef.current) clearTimeout(blurHideRef.current);
    },
    [],
  );

  const scheduleHide = useCallback(() => {
    if (blurHideRef.current) clearTimeout(blurHideRef.current);
    blurHideRef.current = window.setTimeout(() => {
      blurHideRef.current = null;
      hide();
    }, 300);
  }, [hide]);

  const cancelHide = useCallback(() => {
    if (blurHideRef.current) {
      clearTimeout(blurHideRef.current);
      blurHideRef.current = null;
    }
  }, []);

  return { scheduleHide, cancelHide };
}

/** OpenStreetMap-only (no Google key, or Google script not ready / failed). */
function AddressInputNominatimOnly({
  value,
  onChange,
  onResolved,
  placeholder = "Enter address…",
  className,
  id,
  disabled,
  minCharsForSuggestions = DEFAULT_MIN_CHARS,
  showClearButton = true,
  showCurrentLocationButton = true,
  googleApiKey,
}: AddressInputProps & { googleApiKey: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const { results, loading } = useDebouncedNominatimSearch(local, minCharsForSuggestions, true);
  const [locating, setLocating] = useState(false);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const dedupePick = usePickDedupe();

  const hideSuggestions = useCallback(() => setSuggestionsHidden(true), []);
  const { scheduleHide, cancelHide } = useBlurHideDelay(hideSuggestions);

  const pick = useCallback(
    (hit: NominatimHit) => {
      cancelHide();
      const line = hit.formattedLine ?? nominatimHitToResolved(hit).formattedAddress;
      const r = nominatimHitToResolved(hit);
      const formatted = line || r.formattedAddress;
      setSuggestionsHidden(true);
      setLocal(formatted);
      onChange(formatted);
      onResolved?.({ formattedAddress: formatted, zip: r.zip, lat: r.lat, lng: r.lng });
    },
    [onChange, onResolved, cancelHide],
  );

  const useCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          let resolved: AddressResolved | null = null;
          if (googleApiKey) {
            resolved = await reverseGeocodeGoogle(latitude, longitude, googleApiKey);
          }
          if (!resolved) {
            resolved = await reverseGeocodeNominatim(latitude, longitude);
          }
          if (resolved) {
            setSuggestionsHidden(true);
            setLocal(resolved.formattedAddress);
            onChange(resolved.formattedAddress);
            onResolved?.(resolved);
          }
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [googleApiKey, onChange, onResolved]);

  const clearField = useCallback(() => {
    cancelHide();
    setSuggestionsHidden(true);
    setLocal("");
    onChange("");
    onResolved?.(null);
  }, [onChange, onResolved, cancelHide]);

  const qOk = local.trim().length >= minCharsForSuggestions;
  const showNoResults = qOk && !loading && results.length === 0;
  const showDropdown =
    !suggestionsHidden && qOk && (loading || results.length > 0 || showNoResults);

  return (
    <div className="space-y-2">
      {showCurrentLocationButton ? (
        <button
          type="button"
          disabled={disabled || locating}
          onClick={useCurrentLocation}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#00FF88]/30 bg-[#0a1a0a] px-3 py-2.5 text-xs font-semibold text-[#00FF88] disabled:opacity-50"
        >
          <span>📍</span>
          {locating ? "Getting location…" : "Use My Current Location"}
        </button>
      ) : null}

      <div className="relative z-[100] isolate overflow-visible">
        <input
          id={id}
          disabled={disabled}
          value={local}
          onChange={(e) => {
            const v = e.target.value;
            cancelHide();
            setSuggestionsHidden(false);
            setLocal(v);
            onChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSuggestionsHidden(true);
          }}
          onBlur={scheduleHide}
          onFocus={cancelHide}
          placeholder={placeholder}
          autoComplete="off"
          inputMode="search"
          className={cn(
            "w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] py-2 pl-3 pr-20 text-sm text-[var(--text)] outline-none focus:border-[#00FF88]",
            className,
          )}
        />
        <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {loading && qOk ? (
            <span
              className="pointer-events-none inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[#00FF88]"
              aria-hidden
            />
          ) : null}
          {showClearButton && local ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearField();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearField();
              }}
              className="pointer-events-auto touch-manipulation rounded p-1 text-lg leading-none text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
              aria-label="Clear address"
            >
              ×
            </button>
          ) : null}
        </div>

        {showDropdown ? (
          <ul className={cn(suggestionDropdownClass, "text-sm")} role="listbox">
            {loading && results.length === 0 ? (
              <li className="px-4 py-3 text-[var(--sub)]" role="status">
                🔍 Searching…
              </li>
            ) : null}
            {showNoResults ? (
              <li className="px-4 py-3 text-xs text-zinc-500" role="status">
                No addresses found — try typing more
              </li>
            ) : null}
            {results.map((hit, idx) => {
              const { primary, sub } = splitNominatimHit(hit);
              const runPick = () => dedupePick(() => pick(hit));
              return (
                <li
                  key={String(hit.place_id ?? `${hit.lat}-${hit.lon}-${idx}`)}
                  role="option"
                >
                  <div
                    className={suggestionItemClass}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      runPick();
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      runPick();
                    }}
                  >
                    <SuggestionPrimarySub primary={primary} sub={sub} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Google Places when loaded; parallel Nominatim so we never stall on Google alone. */
function AddressInputGoogleHybrid({
  apiKey,
  value,
  onChange,
  onResolved,
  placeholder = "Enter address…",
  className,
  id,
  disabled,
  minCharsForSuggestions = DEFAULT_MIN_CHARS,
  showClearButton = true,
  showCurrentLocationButton = true,
}: AddressInputProps & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "gridd-google-maps",
    googleMapsApiKey: apiKey,
    libraries,
  });

  if (loadError) {
    return (
      <AddressInputNominatimOnly
        value={value}
        onChange={onChange}
        onResolved={onResolved}
        placeholder={placeholder}
        className={className}
        id={id}
        disabled={disabled}
        minCharsForSuggestions={minCharsForSuggestions}
        showClearButton={showClearButton}
        showCurrentLocationButton={showCurrentLocationButton}
        googleApiKey=""
      />
    );
  }

  const {
    ready,
    value: acValue,
    suggestions: { status, data, loading },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    requestOptions: { componentRestrictions: { country: "us" } },
    debounce: 400,
    initOnMount: false,
  });

  const { results: nomResults, loading: nomLoading } = useDebouncedNominatimSearch(
    acValue,
    minCharsForSuggestions,
    true,
  );

  const [locating, setLocating] = useState(false);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const dedupePick = usePickDedupe();

  useEffect(() => {
    if (isLoaded) init();
  }, [isLoaded, init]);

  useEffect(() => {
    setValue(value, false);
  }, [value, setValue]);

  const hideSuggestions = useCallback(() => {
    setSuggestionsHidden(true);
    clearSuggestions();
  }, [clearSuggestions]);

  const { scheduleHide, cancelHide } = useBlurHideDelay(hideSuggestions);

  const pickGoogle = useCallback(
    async (description: string) => {
      cancelHide();
      setSuggestionsHidden(true);
      try {
        const results = await getGeocode({ address: description });
        const first = results[0];
        if (!first) return;
        const { lat, lng } = await getLatLng(first);
        const formatted = first.formatted_address ?? description;
        const zip = first.address_components?.find((c) => c.types.includes("postal_code"))?.long_name;
        setValue(formatted, false);
        clearSuggestions();
        onChange(formatted);
        onResolved?.({ formattedAddress: formatted, zip, lat, lng });
      } catch {
        setValue(description, false);
        clearSuggestions();
        onChange(description);
      }
    },
    [clearSuggestions, onChange, onResolved, setValue, cancelHide],
  );

  const pickNominatim = useCallback(
    (hit: NominatimHit) => {
      cancelHide();
      setSuggestionsHidden(true);
      const r = nominatimHitToResolved(hit);
      const formatted = hit.formattedLine ?? r.formattedAddress;
      setValue(formatted, false);
      clearSuggestions();
      onChange(formatted);
      onResolved?.({ formattedAddress: formatted, zip: r.zip, lat: r.lat, lng: r.lng });
    },
    [clearSuggestions, onChange, onResolved, setValue, cancelHide],
  );

  const useCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          let resolved = await reverseGeocodeGoogle(latitude, longitude, apiKey);
          if (!resolved) resolved = await reverseGeocodeNominatim(latitude, longitude);
          if (resolved) {
            setSuggestionsHidden(true);
            setValue(resolved.formattedAddress, false);
            clearSuggestions();
            onChange(resolved.formattedAddress);
            onResolved?.(resolved);
          }
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [apiKey, clearSuggestions, onChange, onResolved, setValue]);

  const clearField = useCallback(() => {
    cancelHide();
    setSuggestionsHidden(true);
    setValue("", false);
    clearSuggestions();
    onChange("");
    onResolved?.(null);
  }, [clearSuggestions, onChange, onResolved, setValue, cancelHide]);

  const googleHits = status === "OK" && data.length > 0;
  const useGoogleList = googleHits;
  const qOk = acValue.trim().length >= minCharsForSuggestions;
  const showWaitingRow = qOk && !useGoogleList && nomResults.length === 0 && (loading || nomLoading);
  const showNoResults =
    qOk &&
    !suggestionsHidden &&
    !loading &&
    !nomLoading &&
    !useGoogleList &&
    nomResults.length === 0;
  const showDropdown =
    !suggestionsHidden &&
    qOk &&
    (useGoogleList || nomResults.length > 0 || showWaitingRow || showNoResults);

  if (!isLoaded) {
    return (
      <AddressInputNominatimOnly
        value={value}
        onChange={onChange}
        onResolved={onResolved}
        placeholder={placeholder}
        className={className}
        id={id}
        disabled={disabled}
        minCharsForSuggestions={minCharsForSuggestions}
        showClearButton={showClearButton}
        showCurrentLocationButton={showCurrentLocationButton}
        googleApiKey={apiKey}
      />
    );
  }

  return (
    <div className="space-y-2">
      {showCurrentLocationButton ? (
        <button
          type="button"
          disabled={disabled || locating}
          onClick={useCurrentLocation}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#00FF88]/30 bg-[#0a1a0a] px-3 py-2.5 text-xs font-semibold text-[#00FF88] disabled:opacity-50"
        >
          <span>📍</span>
          {locating ? "Getting location…" : "Use My Current Location"}
        </button>
      ) : null}

      <div className="relative z-[100] isolate overflow-visible">
        <input
          id={id}
          disabled={disabled || !ready}
          value={acValue}
          onChange={(e) => {
            const v = e.target.value;
            cancelHide();
            setSuggestionsHidden(false);
            setValue(v);
            onChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              clearSuggestions();
              setSuggestionsHidden(true);
            }
          }}
          onBlur={scheduleHide}
          onFocus={cancelHide}
          placeholder={placeholder}
          autoComplete="off"
          inputMode="search"
          className={cn(
            "w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] py-2 pl-3 pr-20 text-sm text-[var(--text)] outline-none focus:border-[#00FF88]",
            className,
          )}
        />
        <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {(loading || nomLoading) && qOk ? (
            <span
              className="pointer-events-none inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[#00FF88]"
              aria-hidden
            />
          ) : null}
          {showClearButton && acValue ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearField();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearField();
              }}
              className="pointer-events-auto touch-manipulation rounded p-1 text-lg leading-none text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
              aria-label="Clear address"
            >
              ×
            </button>
          ) : null}
        </div>

        {showDropdown ? (
          <ul className={cn(suggestionDropdownClass, "text-sm")} role="listbox">
            {showWaitingRow ? (
              <li className="px-4 py-3 text-[var(--sub)]" role="status">
                🔍 Searching…
              </li>
            ) : null}
            {showNoResults ? (
              <li className="px-4 py-3 text-xs text-zinc-500" role="status">
                No addresses found — try typing more
              </li>
            ) : null}
            {useGoogleList
              ? data.map(({ place_id, description }) => {
                  const { primary, sub } = splitGoogleDescription(description);
                  const runPick = () => dedupePick(() => void pickGoogle(description));
                  return (
                    <li key={place_id} role="option">
                      <div
                        className={suggestionItemClass}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          runPick();
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          runPick();
                        }}
                      >
                        <SuggestionPrimarySub primary={primary} sub={sub} />
                      </div>
                    </li>
                  );
                })
              : nomResults.map((hit, idx) => {
                  const { primary, sub } = splitNominatimHit(hit);
                  const runPick = () => dedupePick(() => pickNominatim(hit));
                  return (
                    <li
                      key={String(hit.place_id ?? `${hit.lat}-${hit.lon}-${idx}`)}
                      role="option"
                    >
                      <div
                        className={suggestionItemClass}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          runPick();
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          runPick();
                        }}
                      >
                        <SuggestionPrimarySub primary={primary} sub={sub} />
                      </div>
                    </li>
                  );
                })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function AddressInput(props: AddressInputProps) {
  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY ??
    "";

  if (!apiKey) {
    return <AddressInputNominatimOnly {...props} googleApiKey="" />;
  }

  return <AddressInputGoogleHybrid {...props} apiKey={apiKey} />;
}
