/** GRIDD-NAME-1234 */
export function slugFromName(name: string | undefined, email: string | undefined): string {
  const raw = (name ?? email?.split("@")[0] ?? "member").toUpperCase();
  const slug = raw.replace(/[^A-Z0-9]/g, "").slice(0, 8) || "MEMBER";
  return slug;
}

export function randomSuffix4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function buildReferralCode(name: string | undefined, email: string | undefined): string {
  return `GRIDD-${slugFromName(name, email)}-${randomSuffix4()}`;
}
