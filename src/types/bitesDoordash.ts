import type { BitePriceRange } from "@/types/bites";

/** Normalized row for Drive-linked store (developer business + store). */
export type DoorDashLinkedBusiness = {
  id: string;
  /** external_business_id from Drive */
  doordashId: string;
  externalBusinessId: string;
  externalStoreId: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  cuisine: string[];
  rating: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrder: number;
  imageUrl: string;
  isOpen: boolean;
  priceRange: BitePriceRange;
  source: "doordash_developer" | "doordash_nearby" | "manual";
  distanceMiles?: number;
  /** Firestore CEO manual listing — customer checkout skips DoorDash */
  manualFulfillment?: boolean;
};

export type BitesDoordashMenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
  calories: number;
  tags: string[];
  options: unknown[];
};
