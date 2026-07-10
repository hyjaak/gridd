/**
 * BINTA GRIDD VAULT — 10% of CEO gross (90% of platform fee) on every completed job.
 * CEO gross = 0.9 × platform fee → vault = 0.1 × CEO gross = 0.09 × platform fee.
 */

export const BINTA_VAULT_CEO_FEE_FRACTION = 0.9; // 90% of platform fee
export const BINTA_VAULT_SAVE_FROM_CEO_FRACTION = 0.1; // 10% of that CEO share

export function bintaVaultDepositCentsFromPlatformFeeCents(platformFeeCents: number): number {
  if (platformFeeCents <= 0) return 0;
  const ceoGrossCents = Math.round(platformFeeCents * BINTA_VAULT_CEO_FEE_FRACTION);
  return Math.max(0, Math.round(ceoGrossCents * BINTA_VAULT_SAVE_FROM_CEO_FRACTION));
}

/** Milestone thresholds in whole USD (display). */
export const BINTA_MILESTONES_USD: { label: string; usd: number; emoji: string }[] = [
  { label: "First Save", usd: 10, emoji: "🌱" },
  { label: "Emergency Fund", usd: 100, emoji: "🔥" },
  { label: "Safety Net", usd: 500, emoji: "💪" },
  { label: "Four Figures", usd: 1_000, emoji: "👑" },
  { label: "War Chest", usd: 5_000, emoji: "🏦" },
  { label: "Empire Fund", usd: 10_000, emoji: "🚀" },
];
