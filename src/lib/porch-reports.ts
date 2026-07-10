import type { PorchPost } from "@/types";

/** Values stored in Firestore `reports.reason` */
export const PORCH_REPORT_REASONS = [
  { id: "spam", label: "🚫 Spam or misleading" },
  { id: "harassment", label: "🤬 Harassment or bullying" },
  { id: "inappropriate", label: "❌ Inappropriate content" },
  { id: "adult", label: "🔞 Adult content" },
  { id: "false_info", label: "⚠️ False information" },
  { id: "violence", label: "🔫 Violence or dangerous" },
  { id: "other", label: "📋 Other" },
] as const;

export type PorchReportReasonId = (typeof PORCH_REPORT_REASONS)[number]["id"];

export function porchReportReasonLabel(id: string): string {
  const row = PORCH_REPORT_REASONS.find((r) => r.id === id);
  return row?.label ?? id;
}

export function buildPostContentSnapshot(post: Pick<PorchPost, "title" | "body">): string {
  const t = (post.title ?? "").trim();
  const b = (post.body ?? "").trim();
  return `${t}\n\n${b}`.slice(0, 8000);
}
