import { NextResponse } from "next/server";
import { uberApi } from "@/lib/uberApi";
import { takePendingOauthState, saveUberTokensForUser } from "@/lib/uberServerSync";

const SITE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://gridd.click";

/**
 * Uber OAuth redirect target — exchanges `code` and stores tokens on the user.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(
      new URL(`/profile?uber=error&reason=${encodeURIComponent(err)}`, SITE).toString(),
    );
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/profile?uber=error&reason=missing", SITE).toString());
  }
  const uid = await takePendingOauthState(state);
  if (!uid) {
    return NextResponse.redirect(
      new URL("/profile?uber=error&reason=state", SITE).toString(),
    );
  }
  try {
    const t = await uberApi.exchangeCode(code);
    await saveUberTokensForUser(
      uid,
      t.access_token,
      t.refresh_token,
      t.expires_in,
    );
    return NextResponse.redirect(new URL("/profile?uber=connected=1", SITE).toString());
  } catch {
    return NextResponse.redirect(
      new URL("/profile?uber=error&reason=exchange", SITE).toString(),
    );
  }
}
