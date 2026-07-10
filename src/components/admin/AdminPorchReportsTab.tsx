"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { blockUser, dismissPorchReport, removePorchPostCascadeClient } from "@/lib/admin-firestore";
import { porchReportReasonLabel } from "@/lib/porch-reports";
import type { PorchReportDoc } from "@/types";

const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";
const GREEN = "#00FF88";

export type ReportRow = { id: string } & PorchReportDoc;

function formatCreated(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
  if (typeof raw === "string") return new Date(raw).toLocaleString();
  return "—";
}

export function AdminPorchReportsTab() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(120));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setErr(null);
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PorchReportDoc, "id">),
          })),
        );
      },
      (e) => setErr(e.message),
    );
    return () => unsub();
  }, []);

  const pending = useMemo(() => rows.filter((r) => r.status !== "dismissed"), [rows]);

  async function dismiss(id: string) {
    setBusy(id);
    try {
      await dismissPorchReport(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function removePost(postId: string) {
    if (!confirm("Delete this post permanently?")) return;
    setBusy(`rm-${postId}`);
    try {
      await removePorchPostCascadeClient(postId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function banUser(uid: string) {
    if (!confirm("Ban this user? They will be blocked on users + providers.")) return;
    setBusy(`ban-${uid}`);
    try {
      await blockUser(uid);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-zinc-100">Porch reports</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {pending.length} pending · {rows.length} total loaded
      </p>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}

      <div className="mt-6 space-y-4">
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending reports.</p>
        ) : null}
        {pending.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border p-4"
            style={{ background: CARD, borderColor: BORDER }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs text-zinc-500">{formatCreated(r.createdAt)}</div>
                <div className="mt-1 text-sm font-semibold text-zinc-200">
                  {porchReportReasonLabel(r.reason)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Reporter: <span className="text-zinc-300">{r.reporterName}</span> · Reported user:{" "}
                  <span className="font-mono text-zinc-400">{r.reportedUserId}</span>
                </div>
              </div>
              <Link
                href={`/porch/${r.postId}`}
                className="text-xs font-semibold hover:underline"
                style={{ color: GREEN }}
              >
                Open post →
              </Link>
            </div>
            <div className="mt-3 rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs leading-relaxed text-zinc-400">
              {r.postContent || "(no snapshot)"}
            </div>
            {r.details ? (
              <p className="mt-2 text-xs text-zinc-500">
                <span className="text-zinc-600">Details:</span> {r.details}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/5"
                onClick={() => void dismiss(r.id)}
              >
                {busy === r.id ? "…" : "Dismiss"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/40"
                onClick={() => void removePost(r.postId)}
              >
                {busy === `rm-${r.postId}` ? "…" : "Remove post"}
              </button>
              <button
                type="button"
                disabled={busy !== null || !r.reportedUserId}
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-950/40"
                onClick={() => void banUser(r.reportedUserId)}
              >
                {busy === `ban-${r.reportedUserId}` ? "…" : "Ban user"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
