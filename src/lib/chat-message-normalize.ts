import type { QueryDocumentSnapshot } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import type { JobChatMessage } from "@/types";

export function chatMsgTime(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toISOString();
  if (typeof raw === "string") return raw;
  return new Date().toISOString();
}

/** Maps Firestore `chats/{jobId}/messages` docs (new + legacy fields) to JobChatMessage. */
export function normalizeChatDocToJobMessage(
  d: QueryDocumentSnapshot,
  jobId: string,
): JobChatMessage {
  const data = d.data() as Record<string, unknown>;
  const legacyRole = data.senderRole as string | undefined;
  const r = data.role as string | undefined;
  const senderRole: JobChatMessage["senderRole"] =
    legacyRole === "admin" || legacyRole === "ceo"
      ? "ceo"
      : legacyRole === "driver" || r === "provider"
        ? "driver"
        : "customer";
  const senderUid = String(data.senderUid ?? data.senderId ?? "");
  return {
    id: d.id,
    jobId,
    senderUid,
    senderRole,
    text: String(data.text ?? ""),
    createdAt: chatMsgTime(data.createdAt),
    smsSent: Boolean(data.smsSent),
    readByUids: Array.isArray(data.readByUids) ? (data.readByUids as string[]) : [],
    attachmentUrl: typeof data.attachmentUrl === "string" ? data.attachmentUrl : undefined,
  };
}
