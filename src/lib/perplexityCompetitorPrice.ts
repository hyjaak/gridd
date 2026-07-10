/**
 * Shared Perplexity call for non-ride service “market” USD (used by PriceIQ + daily monitor).
 */
export function zip5ForPrice(z: string): string {
  return z.replace(/\D/g, "").slice(0, 5);
}

export async function fetchPerplexityCompetitorUsd(
  service: string,
  zip: string,
  miles: number,
): Promise<number | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;

  const prompt = [
    `What is a typical all-in price in USD for a "${service}" local service`,
    `in ZIP code ${zip5ForPrice(zip)} for roughly ${miles.toFixed(1)} miles distance?`,
    `Consider Uber, TaskRabbit, Thumbtack, Angi as references.`,
    `Reply with ONLY one decimal number (USD), no words.`,
  ].join(" ");

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
    }),
  }).catch(() => null);

  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
  const m = text.match(/(\d+(?:\.\d+)?)/);
  const n = m ? parseFloat(m[1]) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
