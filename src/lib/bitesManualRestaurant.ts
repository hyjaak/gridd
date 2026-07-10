import type { BitePriceRange } from "@/types/bites";
import type { DoorDashLinkedBusiness } from "@/types/bitesDoordash";

/** Normalize CEO manual `restaurants/{id}` docs into the feed shape BitesMain expects. */
export function manualRestaurantDocToLinkedBusiness(
  id: string,
  raw: Record<string, unknown>,
): DoorDashLinkedBusiness {
  const cuisineStr = typeof raw.cuisine === "string" ? raw.cuisine : "";
  const cuisine = cuisineStr
    ? cuisineStr.split(",").map((s) => s.trim()).filter(Boolean)
    : ["Local"];
  const price = (typeof raw.priceRange === "string" ? raw.priceRange : "$$") as BitePriceRange;
  const lat = typeof raw.lat === "number" ? raw.lat : Number(raw.lat) || 0;
  const lng = typeof raw.lng === "number" ? raw.lng : Number(raw.lng) || 0;

  return {
    id,
    doordashId: `manual_${id}`,
    externalBusinessId: id,
    externalStoreId: id,
    name: String(raw.name ?? "Restaurant"),
    address: String(raw.address ?? ""),
    phone: String(raw.phone ?? ""),
    lat,
    lng,
    cuisine,
    rating: typeof raw.rating === "number" ? raw.rating : Number(raw.rating) || 4.6,
    deliveryTime: String(raw.estimatedTime ?? raw.deliveryTime ?? "30–45 min"),
    deliveryFee: typeof raw.deliveryFee === "number" ? raw.deliveryFee : Number(raw.deliveryFee) || 3.99,
    minOrder: typeof raw.minOrder === "number" ? raw.minOrder : Number(raw.minOrder) || 0,
    imageUrl: String(raw.imageUrl ?? ""),
    isOpen: raw.isOpen !== false,
    priceRange: ["$", "$$", "$$$", "$$$$"].includes(price) ? price : "$$",
    source: "manual",
    manualFulfillment: true,
  };
}
