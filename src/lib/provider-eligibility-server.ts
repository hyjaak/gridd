import type { Provider } from "@/types";
import { canGoOnline } from "@/lib/driver-gate";
import { isProviderAvailableForMatching } from "@/lib/provider-status";

/** Eligible to appear in customer booking / search results. */
export function providerEligibleForMatching(p: Provider): boolean {
  if (p.blocked) return false;
  if (!canGoOnline(p)) return false;
  return isProviderAvailableForMatching(p);
}

export function filterProvidersForPublicList(providers: Provider[]): Provider[] {
  return providers.filter((p) => providerEligibleForMatching(p));
}
