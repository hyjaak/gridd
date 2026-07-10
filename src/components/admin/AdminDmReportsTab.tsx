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
import { db } from "@/lib/firebase";
import { blockUser, dismissDmReport } from "@/lib/admin-firestore";

type DmReportRow = {
  id: string;
  conversationId?: string;
  reportedUserId?: string;
  reportedBy?: string;
  reporterName?: string;
  reason?: string;
  details?: string;
  snapshot?: string;
  createdAt?: unknown;
  status?: string;
};

function fmt(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toLocaleString();
  return "—";
}

export function AdminDmReportsTab() {
  const [rows, setRows] = useState<DmReportRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "dmReports"), orderBy("createdAt", "desc"), limit(80));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setErr(null);
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmReportRow, "id">) })));
      },
      (e) => setErr(e.message),
    );
    return () => unsub();
  }, []);

  const pending = useMemo(() => rows.filter((r) => r.status !== "dismissed"), [rows]);

  return (
    <div>
      <h2 className="text-lg font-bold text-zinc-100">Reported DMs</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Only conversations that users report appear here. {pending.length} pending.
      </p>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      <div className="mt-6 space-y-4">
        {pending.length === 0 ? <p className="text-sm text-zinc-500">No reported DM threads.</p> : null}
        {pending.map((r) => (
          <div key={r.id} className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4">
            <div className="text-xs text-zinc-500">{fmt(r.createdAt)}</div>
            <div className="mt-1 text-sm text-zinc-300">
              Reporter: {r.reporterName} · Reported user: {r.reportedUserId}
            </div>
            <div className="mt-2 font-mono text-xs text-zinc-500">conv: {r.conversationId}</div>
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-zinc-400">
              {r.snapshot || r.details || "(no text)"}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300"
                onClick={() =>
                  void dismissDmReport(r.id).catch((e) => alert(e instanceof Error ? e.message : "Failed"))
                }
              >
                Dismiss
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200"
                onClick={() => {
                  const uid = r.reportedUserId?.trim();
                  if (!uid || !confirm(`Ban user ${uid} from the platform?`)) return;
                  void blockUser(uid).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
                }}
              >
                Ban reported user
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
