/** Central env for Uber Rides + OAuth. */

export const UBER_V12_BASE = "https://api.uber.com/v1.2";
/** User authorization (browser redirect). */
export const UBER_OAUTH_AUTHORIZE_BASE = "https://login.uber.com/oauth/v2";

/**
 * Access-token exchange and refresh. Uber uses `auth.uber.com` for `/token`, not `login.uber.com`.
 * Override with full URL if your dashboard says otherwise, e.g. UBER_OAUTH_TOKEN_URL="https://auth.uber.com/oauth/v2/token"
 */
export function uberAccessTokenUrl(): string {
  const u = process.env.UBER_OAUTH_TOKEN_URL?.trim();
  if (u) return u;
  return "https://auth.uber.com/oauth/v2/token";
}

export function uberRedirectUri(): string {
  if (process.env.UBER_REDIRECT_URI?.trim()) return process.env.UBER_REDIRECT_URI.trim();
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (app) return `${app}/uber/callback`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/uber/callback`;
  return "http://localhost:3000/uber/callback";
}

export function uberClientId(): string {
  const v = process.env.UBER_CLIENT_ID;
  if (!v) throw new Error("UBER_CLIENT_ID missing");
  return v;
}

export function uberClientSecret(): string {
  const v = process.env.UBER_CLIENT_SECRET;
  if (!v) throw new Error("UBER_CLIENT_SECRET missing");
  return v;
}

export function serverToken(): string | null {
  return process.env.UBER_SERVER_TOKEN?.trim() || null;
}
