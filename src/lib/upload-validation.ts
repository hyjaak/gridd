/** Max size for driver verification uploads (bytes). */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Driver document uploads: images or PDF only. */
export function validateDocumentFile(f: File): string | null {
  if (f.size > MAX_DOCUMENT_BYTES) {
    return "File too large (max 15MB)";
  }
  const t = f.type.toLowerCase();
  const ok = t.startsWith("image/") || t === "application/pdf";
  if (!ok) return "Upload a photo (JPG, PNG, etc.) or a PDF.";
  return null;
}
