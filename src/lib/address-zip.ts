/** Pull a US ZIP from freeform address text. */
export function extractZipFromAddressLine(line: string | undefined): string | null {
  if (!line?.trim()) return null;
  const m = line.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] ?? null : null;
}

/** Best-effort city label from "…, City, ST 30052" style strings. */
export function guessNeighborhoodCity(
  homeAddress: string | undefined,
  fallbackZip: string | null,
): string | null {
  if (!homeAddress?.trim()) return fallbackZip ? `ZIP ${fallbackZip}` : null;
  const parts = homeAddress
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const maybe = parts[parts.length - 2];
    if (maybe && !/^\d/.test(maybe)) return maybe;
  }
  return fallbackZip ? `ZIP ${fallbackZip}` : null;
}
