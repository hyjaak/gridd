import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { MAX_DOCUMENT_BYTES, validateDocumentFile } from "@/lib/upload-validation";

const UPLOAD_TIMEOUT_MS = 60_000;
/** If no bytes transferred after this long, treat as blocked (rules/network). */
const STUCK_AT_ZERO_MS = 5_000;

export const UPLOAD_STUCK_AT_ZERO = "UPLOAD_STUCK_AT_ZERO";

export function mapUploadFailureToMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === UPLOAD_STUCK_AT_ZERO) {
      return stuckAtZeroMessage();
    }
    if (err.message === "Upload timed out") {
      return "Connection lost — tap to retry";
    }
    const m = err.message.toLowerCase();
    if (m.includes("network") || m.includes("failed to fetch") || m.includes("load failed")) {
      return "Connection lost — tap to retry";
    }
  }
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? "";
  if (
    code === "storage/retry-limit-exceeded" ||
    code === "storage/unavailable" ||
    code === "storage/canceled"
  ) {
    return "Connection lost — tap to retry";
  }
  if (code === "storage/unauthorized") {
    return "Upload failed — tap to try again";
  }
  return "Upload failed — tap to try again";
}

function stuckAtZeroMessage() {
  return "Upload failed — check connection";
}

/**
 * Resumable upload with overall timeout, per-file progress (0–100), and stuck-at-0 detection.
 */
export async function uploadDriverDocument(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File too large (max 15MB)");
  }
  const pre = validateDocumentFile(file);
  if (pre) {
    throw new Error(pre);
  }

  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    let settled = false;
    let clearZeroStuck: (() => void) | undefined;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearZeroStuck?.();
      try {
        uploadTask.cancel();
      } catch {
        /* ignore */
      }
      reject(new Error("Upload timed out"));
    }, UPLOAD_TIMEOUT_MS);

    const armZeroStuck = () => {
      clearZeroStuck?.();
      let cleared = false;
      const tid = setTimeout(() => {
        if (cleared || settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          uploadTask.cancel();
        } catch {
          /* ignore */
        }
        reject(new Error(UPLOAD_STUCK_AT_ZERO));
      }, STUCK_AT_ZERO_MS);
      clearZeroStuck = () => {
        cleared = true;
        clearTimeout(tid);
      };
    };
    armZeroStuck();

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        if (snapshot.bytesTransferred > 0) {
          clearZeroStuck?.();
          clearZeroStuck = undefined;
        }
        const total = snapshot.totalBytes;
        const pct = total > 0 ? Math.round((snapshot.bytesTransferred / total) * 100) : 0;
        onProgress?.(pct);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearZeroStuck?.();
        clearTimeout(timeout);
        reject(error);
      },
      () => {
        if (settled) return;
        settled = true;
        clearZeroStuck?.();
        clearTimeout(timeout);
        getDownloadURL(uploadTask.snapshot.ref)
          .then(resolve)
          .catch(reject);
      },
    );
  });
}

export type UploadItem = { path: string; file: File };

/** Sequential uploads with overall progress 0–100 across all items. */
export async function uploadDriverDocumentsSequential(
  items: UploadItem[],
  onOverallProgress: (percent: number) => void,
): Promise<string[]> {
  const n = items.length;
  if (n === 0) return [];
  const urls: string[] = [];
  for (let i = 0; i < n; i++) {
    const { path, file } = items[i];
    const url = await uploadDriverDocument(path, file, (p) => {
      const overall = Math.round(((i + p / 100) / n) * 100);
      onOverallProgress(Math.min(100, overall));
    });
    urls.push(url);
    onOverallProgress(Math.round(((i + 1) / n) * 100));
  }
  return urls;
}
