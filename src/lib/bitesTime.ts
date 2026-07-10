import type { Timestamp } from "firebase/firestore";

export function timeAgoShort(created: Timestamp | { toDate?: () => Date } | Date | undefined): string {
  let d: Date;
  if (!created) return "just now";
  if (typeof (created as Timestamp).toDate === "function") d = (created as Timestamp).toDate();
  else if (created instanceof Date) d = created;
  else d = new Date();
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
