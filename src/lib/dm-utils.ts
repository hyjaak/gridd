/** Direct messages — conversation id is lexicographically sorted UIDs joined by underscore. */

export function makeConversationId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export function parseConversationParticipants(conversationId: string): [string, string] | null {
  const i = conversationId.indexOf("_");
  if (i <= 0 || i >= conversationId.length - 1) return null;
  const a = conversationId.slice(0, i);
  const b = conversationId.slice(i + 1);
  if (!a || !b) return null;
  return [a, b];
}

/** For sorting conversation lists client-side (avoids composite index on participants + lastMessageAt). */
export function lastMessageAtToMs(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof raw === "string") {
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

export function dmTimeAgo(iso: unknown): string {
  if (iso == null) return "";
  const t =
    typeof iso === "object" && iso !== null && "toDate" in iso && typeof (iso as { toDate: () => Date }).toDate === "function"
      ? (iso as { toDate: () => Date }).toDate().getTime()
      : typeof iso === "string"
        ? new Date(iso).getTime()
        : NaN;
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString();
}

export function truncateDmPreview(s: string, max = 72): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Inline message timestamp: just now / Nm ago / time / date */
export function formatDmMessageTime(raw: unknown): string {
  if (raw == null) return "";
  const date =
    typeof raw === "object" && raw !== null && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function"
      ? (raw as { toDate: () => Date }).toDate()
      : typeof raw === "string"
        ? new Date(raw)
        : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString();
}
