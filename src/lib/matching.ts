import type { Provider } from "@/types";

export function scoreProvider(provider: Provider, city: string) {
  const sameCity = provider.city.toLowerCase() === city.toLowerCase() ? 1 : 0;
  return sameCity * 10 + provider.rating;
}

export function pickBestProvider(providers: Provider[], city: string) {
  const scored = providers
    .map((p) => ({ p, score: scoreProvider(p, city) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

