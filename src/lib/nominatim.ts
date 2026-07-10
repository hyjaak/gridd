/** Format Nominatim result as a single US-style line: "4071 Sample St, Atlanta, GA 30052" */

export type NominatimSearchHit = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
};

export function formatNominatimAddress(displayName: string, address?: Record<string, string>): string {
  if (!address) {
    return displayName.replace(/, United States(?: of America)?$/i, "").trim();
  }
  const hn = address.house_number;
  const road = address.road ?? address.pedestrian ?? address.path ?? address.neighbourhood;
  const city = address.city ?? address.town ?? address.village ?? address.suburb ?? address.hamlet;
  const state = address.state;
  const zip = address.postcode;

  const line1 = [hn, road].filter(Boolean).join(" ").trim();
  const tailParts: string[] = [];
  if (city) tailParts.push(city);
  if (state && zip) tailParts.push(`${state} ${zip}`);
  else if (state) tailParts.push(state);
  else if (zip) tailParts.push(zip);

  const tail = tailParts.join(", ");
  if (line1 && tail) return `${line1}, ${tail}`;
  if (line1) return line1;
  if (tail) return tail;
  return displayName.replace(/, United States(?: of America)?$/i, "").trim();
}

export function nominatimHitToResolved(hit: NominatimSearchHit): {
  formattedAddress: string;
  zip?: string;
  lat: number;
  lng: number;
} {
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  const zip = hit.address?.postcode;
  return {
    formattedAddress: formatNominatimAddress(hit.display_name, hit.address),
    zip,
    lat,
    lng,
  };
}
