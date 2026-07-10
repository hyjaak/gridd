/** Uber Rides API v1.2–style response shapes (subset; API may return more). */

export type UberTokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token_expires_in?: number;
};

export type UberPriceEstimate = {
  product_id: string;
  display_name: string;
  low_estimate: number;
  high_estimate: number;
  duration?: number;
  distance?: number;
  currency_code?: string;
  /** Present on some product responses for request flows */
  fare_id?: string;
  /** Surge when API returns it */
  surge_multiplier?: number;
};

export type UberTimeEstimate = {
  product_id: string;
  display_name?: string;
  /** ETA in seconds to pickup (typical) */
  estimate: number;
};

export type UberProduct = {
  product_id: string;
  display_name: string;
  description?: string;
  capacity?: number;
  image?: string;
};

export type UberProductResponse = {
  products?: UberProduct[];
};

export type UberPricesResponse = {
  prices?: UberPriceEstimate[];
};

export type UberTimesResponse = {
  times?: UberTimeEstimate[];
};

export type UberRideRequest = {
  request_id: string;
  status?: string;
  product_id?: string;
} & Record<string, unknown>;

export type UberRideDetail = {
  status?: string;
  request_id?: string;
  product_id?: string;
  request?: { status?: string };
  location?: {
    latitude: number;
    longitude: number;
    bearing?: number;
  };
  driver?: {
    name?: string;
    phone_number?: string;
    rating?: number;
    picture_url?: string;
  };
  vehicle?: {
    make?: string;
    model?: string;
    license_plate?: string;
    color?: string;
  };
  pickup?: { eta?: number };
} & Record<string, unknown>;

export type UberCancelPreview = {
  requiresConfirmation?: boolean;
  fee?: { amount: number; currency_code?: string };
  cancellation_fee?: { amount: number; currency_code?: string };
  cancellation_fee_formatted?: string;
} & Record<string, unknown>;

export type UberReceipt = {
  total_charged?: string;
  total_fare?: string;
  subtotal?: string;
  distance?: string;
  duration?: string;
  charges?: unknown[];
  rate_type_id?: string;
} & Record<string, unknown>;

export type UberProfile = {
  uuid?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
} & Record<string, unknown>;

export type UberMappedProduct = {
  uberProductId: string;
  displayName: string;
  description?: string;
  capacity?: number;
  imageUrl?: string;
  griddType: "standard" | "xl" | "premium";
};
