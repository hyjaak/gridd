import type {
  UberCancelPreview,
  UberMappedProduct,
  UberPricesResponse,
  UberProductResponse,
  UberProfile,
  UberReceipt,
  UberRideDetail,
  UberRideRequest,
  UberTimesResponse,
  UberTokens,
} from "@/lib/uberTypes";
import {
  UBER_V12_BASE,
  UBER_OAUTH_AUTHORIZE_BASE,
  uberAccessTokenUrl,
  uberRedirectUri,
  uberClientId,
  uberClientSecret,
  serverToken,
} from "@/lib/uberConfig";

const DEFAULT_LANG = "en_US";

function authHeaderToken(token: string) {
  return `Token ${token}`;
}

function authHeaderBearer(token: string) {
  return `Bearer ${token}`;
}

export class UberApiService {
  private get serverT(): string | null {
    return serverToken();
  }

  // ─── OAuth ───

  /**
   * `state` should be a random server-issued value (not raw user id).
   * redirect_uri must match the developer dashboard and token exchange.
   */
  getAuthUrl(state: string): string {
    const cid = process.env.NEXT_PUBLIC_UBER_CLIENT_ID;
    if (!cid) {
      throw new Error("NEXT_PUBLIC_UBER_CLIENT_ID is not set");
    }
    const redirect = uberRedirectUri();
    const params = new URLSearchParams({
      client_id: cid,
      response_type: "code",
      redirect_uri: redirect,
      // ride requests + user identity for /v1.2/me
      scope: "profile request",
      state,
    });
    return `${UBER_OAUTH_AUTHORIZE_BASE}/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<UberTokens> {
    const cid = uberClientId();
    const sec = uberClientSecret();
    const redirect = uberRedirectUri();
    const res = await fetch(uberAccessTokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cid,
        client_secret: sec,
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Uber token failed: ${res.status} ${t}`);
    }
    return (await res.json()) as UberTokens;
  }

  async refreshUserAccessToken(refreshToken: string): Promise<UberTokens> {
    const cid = uberClientId();
    const sec = uberClientSecret();
    const res = await fetch(uberAccessTokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cid,
        client_secret: sec,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Uber refresh failed: ${res.status} ${t}`);
    }
    return (await res.json()) as UberTokens;
  }

  // ─── Public (server token) — Price / ETA / products ───

  async getPriceEstimates(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
  ): Promise<UberPricesResponse> {
    const t = this.serverT;
    if (!t) return { prices: [] };
    const url = new URL(`${UBER_V12_BASE}/estimates/price`);
    url.searchParams.set("start_latitude", String(startLat));
    url.searchParams.set("start_longitude", String(startLng));
    url.searchParams.set("end_latitude", String(endLat));
    url.searchParams.set("end_longitude", String(endLng));
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeaderToken(t),
        "Accept-Language": DEFAULT_LANG,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return { prices: [] };
    return (await res.json()) as UberPricesResponse;
  }

  async getEtaEstimates(lat: number, lng: number): Promise<UberTimesResponse> {
    const t = this.serverT;
    if (!t) return { times: [] };
    const url = new URL(`${UBER_V12_BASE}/estimates/time`);
    url.searchParams.set("start_latitude", String(lat));
    url.searchParams.set("start_longitude", String(lng));
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeaderToken(t),
        "Accept-Language": DEFAULT_LANG,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return { times: [] };
    return (await res.json()) as UberTimesResponse;
  }

  async getProducts(lat: number, lng: number): Promise<UberProductResponse> {
    const t = this.serverT;
    if (!t) return { products: [] };
    const url = new URL(`${UBER_V12_BASE}/products`);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    const res = await fetch(url.toString(), {
      headers: { Authorization: authHeaderToken(t), Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { products: [] };
    return (await res.json()) as UberProductResponse;
  }

  // Alias name from spec
  getNearbyDrivers = this.getProducts;

  // ─── User bearer — ride request lifecycle ───

  async requestRide(
    userAccessToken: string,
    body: {
      fare_id?: string;
      product_id: string;
      start_latitude: number;
      start_longitude: number;
      start_address: string;
      end_latitude: number;
      end_longitude: number;
      end_address: string;
    },
  ): Promise<UberRideRequest> {
    const res = await fetch(`${UBER_V12_BASE}/requests`, {
      method: "POST",
      headers: {
        Authorization: authHeaderBearer(userAccessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: body.product_id,
        start_latitude: body.start_latitude,
        start_longitude: body.start_longitude,
        start_address: body.start_address,
        end_latitude: body.end_latitude,
        end_longitude: body.end_longitude,
        end_address: body.end_address,
        ...(body.fare_id ? { fare_id: body.fare_id } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as UberRideRequest & { message?: string };
    if (!res.ok) {
      throw new Error(
        `Uber request failed: ${res.status} ${(data as { message?: string }).message ?? JSON.stringify(data)}`,
      );
    }
    return data;
  }

  async getRideStatus(userAccessToken: string, requestId: string): Promise<UberRideDetail> {
    const res = await fetch(`${UBER_V12_BASE}/requests/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: authHeaderBearer(userAccessToken), Accept: "application/json" },
      cache: "no-store",
    });
    return (await res.json()) as UberRideDetail;
  }

  /**
   * GET /requests/{id}/cancel — UBER returns 204 or fee payload depending on state.
   */
  async getCancelCost(userAccessToken: string, requestId: string): Promise<UberCancelPreview> {
    const res = await fetch(`${UBER_V12_BASE}/requests/${encodeURIComponent(requestId)}/cancel`, {
      method: "GET",
      headers: { Authorization: authHeaderBearer(userAccessToken), Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 204) return {};
    return (await res.json().catch(() => ({}))) as UberCancelPreview;
  }

  async cancelRide(userAccessToken: string, requestId: string): Promise<void> {
    const res = await fetch(`${UBER_V12_BASE}/requests/${encodeURIComponent(requestId)}`, {
      method: "DELETE",
      headers: { Authorization: authHeaderBearer(userAccessToken) },
    });
    if (!res.ok && res.status !== 204) {
      const t = await res.text();
      throw new Error(`Uber cancel failed: ${res.status} ${t}`);
    }
  }

  async getRideReceipt(userAccessToken: string, requestId: string): Promise<UberReceipt> {
    const res = await fetch(
      `${UBER_V12_BASE}/requests/${encodeURIComponent(requestId)}/receipt`,
      { headers: { Authorization: authHeaderBearer(userAccessToken), Accept: "application/json" } },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Uber receipt: ${res.status} ${t}`);
    }
    return (await res.json()) as UberReceipt;
  }

  async rateRide(
    userAccessToken: string,
    requestId: string,
    opts: { rating: number; feedback?: string; tipUsd?: number },
  ): Promise<void> {
    const body: Record<string, unknown> = { rating: opts.rating, feedback: opts.feedback };
    if (typeof opts.tipUsd === "number" && opts.tipUsd > 0) {
      body.tip_amount = {
        amount: Math.round(opts.tipUsd * 100),
        currency_code: "USD",
      };
    }
    const res = await fetch(`${UBER_V12_BASE}/requests/${encodeURIComponent(requestId)}/rating`, {
      method: "PUT",
      headers: {
        Authorization: authHeaderBearer(userAccessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Uber rate failed: ${res.status} ${t}`);
    }
  }

  async getUserProfile(userAccessToken: string): Promise<UberProfile> {
    const res = await fetch(`${UBER_V12_BASE}/me`, {
      headers: { Authorization: authHeaderBearer(userAccessToken), Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Uber /me: ${res.status} ${t}`);
    }
    return (await res.json()) as UberProfile;
  }

  mapToGRIDDType(uberName: string): "standard" | "xl" | "premium" {
    const n = uberName.toLowerCase();
    if (n.includes("xl") || n.includes("suv")) return "xl";
    if (n.includes("black") || n.includes("lux") || n.includes("prem")) return "premium";
    return "standard";
  }

  /** Products at location, mapped toward GRIDD tiers. */
  async getRideTypes(lat: number, lng: number): Promise<UberMappedProduct[]> {
    const data = await this.getProducts(lat, lng);
    return (data.products ?? []).map((p) => ({
      uberProductId: p.product_id,
      displayName: p.display_name,
      description: p.description,
      capacity: p.capacity,
      imageUrl: p.image,
      griddType: this.mapToGRIDDType(p.display_name),
    }));
  }
}

export const uberApi = new UberApiService();
