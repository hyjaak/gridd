/** Firestore path: chats/{jobId}/messages/{messageId} — jobId may be `preview_{customerUid}` pre-booking. */

export const PROVIDER_WELCOME_TEXT =
  "Hey — I'm on your job. Message me here with details, timing, or questions and I'll confirm next steps.";

export function previewChatJobId(customerUid: string): string {
  return `preview_${customerUid}`;
}

export function isPreviewChatJobId(jobId: string): boolean {
  return jobId.startsWith("preview_");
}
