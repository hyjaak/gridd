import type { Timestamp } from "firebase/firestore";

export type BitePriceRange = "$" | "$$" | "$$$" | "$$$$";

export type BiteRestaurant = {
  name: string;
  cuisine: string[];
  address: string;
  lat: number;
  lng: number;
  phone: string;
  isOpen: boolean;
  openHours: Record<string, unknown>;
  deliveryFee: number;
  estimatedTime: string;
  rating: number;
  priceRange: BitePriceRange;
  tags: string[];
  imageUrl: string;
  areaOrdersToday?: number;
  neighborCount?: number;
  topItemName?: string;
  /** Set when store came from Drive developer list */
  doordashExternalBusinessId?: string;
  doordashExternalStoreId?: string;
  /** CEO-entered store — skip DoorDash dispatch; ops fulfills manually */
  manualFulfillment?: boolean;
};

export type BiteMenuItem = {
  /** Firestore menu doc id when supplied by API */
  id?: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
  calories: number;
  tags: string[];
  gridditCount: number;
  orderCount: number;
  certified?: boolean;
};

export type BiteCartLine = {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type BiteOrderItem = BiteCartLine & { category?: string };

/** Drive + internal pipeline */
export type BiteOrderStatus =
  | "manual_pending"
  | "pending"
  | "confirmed"
  | "doordash_created"
  | "dasher_assigned"
  | "arrived_at_restaurant"
  | "picked_up"
  | "almost_there"
  | "en_route"
  | "delivered"
  | "cancelled"
  | "failed"
  | string;

export type BiteOrder = {
  customerId: string;
  customerName: string;
  customerPhoto: string;
  restaurantId: string;
  restaurantName: string;
  items: BiteOrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tip: number;
  total: number;
  status: BiteOrderStatus;
  /** CEO fulfills delivery until Uber/DoorDash dispatch is wired */
  manualFulfillment?: boolean;
  /** Our doc id === DoorDash external_delivery_id */
  doordashDeliveryId?: string;
  doordashExternalId?: string;
  dasherName?: string;
  dasherPhoto?: string;
  dasherPhone?: string;
  dasherCar?: string;
  dasherPlate?: string;
  dasherLocation?: { lat: number; lng: number };
  estimatedDelivery?: Timestamp;
  estimatedPickup?: Timestamp;
  dropoffAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  isPublic: boolean;
  vibeTag: string;
  caption: string;
  gridditUserIds: string[];
  gridditCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp;
  customerZip?: string;
  /** `YYYY-MM-DD` in customer tz for cheap daily counts */
  dayKey?: string;
  groupOrderId?: string;
  awaitingRating?: boolean;
  /** 1–5 after delivery */
  restaurantRating?: number;
  /** 1–5 after delivery */
  dasherRating?: number;
  ratingNote?: string;
  ratedAt?: Timestamp;
  /** Set once when Bites net revenue is booked to vault / revenue (server). */
  bitesRevenueBooked?: boolean;
  bitesNetProfitCents?: number;
  deliveredAt?: Timestamp;
  lastUpdated?: Timestamp;
};

export type BiteGroupOrder = {
  hostId: string;
  restaurantId: string;
  address: string;
  status: "open" | "locked" | "placed" | "cancelled";
  participantIds: string[];
  orderId?: string;
  createdAt: Timestamp;
};

export type BiteFeedFilter = "trending" | "friends" | "late" | "healthy" | "under10" | "mostGriddit";
