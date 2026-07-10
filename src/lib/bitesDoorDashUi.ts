import type { BiteRestaurant } from "@/types/bites";
import type { DoorDashLinkedBusiness } from "@/types/bitesDoordash";

export function doorDashLinkedToBiteRestaurant(b: DoorDashLinkedBusiness): BiteRestaurant {
  return {
    name: b.name,
    cuisine: b.cuisine,
    address: b.address,
    lat: b.lat,
    lng: b.lng,
    phone: b.phone,
    isOpen: b.isOpen,
    openHours: {},
    deliveryFee: b.deliveryFee,
    estimatedTime: b.deliveryTime,
    rating: b.rating,
    priceRange: b.priceRange,
    tags: b.cuisine,
    imageUrl: b.imageUrl,
    doordashExternalBusinessId: b.externalBusinessId,
    doordashExternalStoreId: b.externalStoreId,
    manualFulfillment: b.manualFulfillment === true || b.source === "manual",
  };
}
