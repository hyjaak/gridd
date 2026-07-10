import { uberApi } from "@/lib/uberApi";
import { getUberTokensForUser, saveUberTokensForUser } from "@/lib/uberServerSync";

/**
 * Returns a valid user access token, refreshing with refresh_token when expired (5 min skew).
 */
export async function getValidUserAccessToken(uid: string): Promise<string> {
  const row = await getUberTokensForUser(uid);
  if (!row) throw new Error("Uber not connected");
  const skew = 5 * 60 * 1000;
  if (row.expiresAt > Date.now() + skew) return row.accessToken;
  if (!row.refreshToken) throw new Error("Uber session expired — reconnect in Profile");
  const t = await uberApi.refreshUserAccessToken(row.refreshToken);
  await saveUberTokensForUser(
    uid,
    t.access_token,
    t.refresh_token ?? row.refreshToken,
    t.expires_in,
  );
  return t.access_token;
}
