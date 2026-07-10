"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import app from "@/lib/firebase";
import { dmTimeAgo } from "@/lib/dm-utils";
import type { DmConversation } from "@/types";

const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";

export function AdminPlatformDmsTab() {
  const [rows, setRows] = useState<(DmConversation & { id: string })[]>([]);
  const [reportCounts, setReportCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportedOnly, setReportedOnly] = useState(false);

  useEffect(() => {
    if (!app) return;
    const db = getFirestore(app);
    const qy = query(collection(db, "conversations"), orderBy("lastMessageAt", "desc"), limit(400));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmConversation, "id">) })));
      },
      () => setRows([]),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!app) return;
    const db = getFirestore(app);
    const qy = query(collection(db, "dmReports"), orderBy("createdAt", "desc"), limit(500));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const counts: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const cid = (d.data() as { conversationId?: string }).conversationId?.trim();
          if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
        });
        setReportCounts(counts);
      },
      () => setReportCounts({}),
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = rows;
    if (reportedOnly) {
      list = list.filter((r) => (reportCounts[r.id] ?? 0) > 0);
    }
    if (qq) {
      list = list.filter((r) => {
        const blob = JSON.stringify(r.participantNames ?? {}).toLowerCase() + (r.lastMessage ?? "").toLowerCase();
        return blob.includes(qq);
      });
    }
    const fa = from ? new Date(from).getTime() : null;
    const tb = to ? new Date(to).getTime() + 86400000 : null;
    if (fa != null || tb != null) {
      list = list.filter((r) => {
        const raw = r.lastMessageAt;
        let t = 0;
        if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
          t = (raw as { toDate: () => Date }).toDate().getTime();
        }
        if (fa != null && t < fa) return false;
        if (tb != null && t > tb) return false;
        return true;
      });
    }
    return list;
  }, [rows, q, from, to, reportedOnly, reportCounts]);

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search all conversations (names, last message preview)…"
        className="w-full rounded-xl border border-zinc-700 bg-black/40 px-3 py-2.5 text-sm text-zinc-200"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={reportedOnly}
            onChange={(e) => setReportedOnly(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Reported conversations only
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-zinc-700 bg-black/40 px-2 py-1 text-zinc-200" />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-zinc-700 bg-black/40 px-2 py-1 text-zinc-200" />
        </label>
      </div>
      <p className="text-xs text-zinc-500">Showing {filtered.length} conversation(s). Open a thread to read full history (including messages hidden per-user).</p>
      <ul className="space-y-2">
        {filtered.map((r) => {
          const names = r.participants.map((uid) => r.participantNames?.[uid] ?? uid).join(" · ");
          const nReports = reportCounts[r.id] ?? 0;
          const mc = r.messageCount;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-3"
              style={{ background: CARD, borderColor: BORDER }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-zinc-200">{names}</span>
                  {nReports > 0 ? (
                    <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                      {nReports} report{nReports === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <span className="text-[10px] text-zinc-600">
                    {typeof mc === "number" ? `${mc} msg` : "— msgs"}
                  </span>
                </div>
                <div className="truncate text-xs text-zinc-500">{r.lastMessage || "(no messages yet)"}</div>
                <div className="text-[10px] text-zinc-600">{dmTimeAgo(r.lastMessageAt)}</div>
              </div>
              <Link
                href={`/admin/dm/${encodeURIComponent(r.id)}`}
                className="shrink-0 rounded-lg bg-[#3B82F6] px-3 py-2 text-xs font-bold text-white hover:opacity-90"
              >
                View full
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
