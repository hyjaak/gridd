"use client";

import { useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { PORCH_REPORT_REASONS } from "@/lib/porch-reports";
import { submitPorchReportClient } from "@/lib/porch-social";
import type { PorchPost } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Props = {
  open: boolean;
  post: PorchPost;
  reporterName: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
};

export function PorchReportModal({ open, post, reporterName, onClose, onSuccess, onError }: Props) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function submit() {
    if (!reason) {
      onError("Choose a reason for your report.");
      return;
    }
    const uid = firebaseAuth?.currentUser?.uid;
    if (!uid) {
      onError("Sign in to report.");
      return;
    }
    setSubmitting(true);
    try {
      await submitPorchReportClient(post, reason, details.trim(), uid, reporterName);
      setReason("");
      setDetails("");
      onSuccess();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "already_reported") {
        onError("You already reported this post.");
        onClose();
        return;
      }
      if (msg === "own_post") {
        onError("You can’t report your own post.");
        onClose();
        return;
      }
      if (msg === "not_found") {
        onError("Post not found.");
        onClose();
        return;
      }
      onError(e instanceof Error ? e.message : "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-[var(--border)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text)]">Report Post</h2>
        <p className="mt-1 text-sm text-[var(--sub)]">Why are you reporting this?</p>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Report reason">
          {PORCH_REPORT_REASONS.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-white/5"
            >
              <input
                type="radio"
                name="porch-report-reason"
                className="mt-0.5 accent-[#00FF88]"
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
              />
              <span className="text-[var(--text)]">{r.label}</span>
            </label>
          ))}
        </div>

        <label className="mt-4 block text-xs text-[var(--sub)]">Add more details (optional)</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="Add more details (optional)…"
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#00FF88]"
        />

        <div className="mt-6 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={submitting || !reason} onClick={() => void submit()}>
            {submitting ? "…" : "Submit Report 🚩"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
