"use client";

import { useEffect, useState } from "react";
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import app from "@/lib/firebase";

const CARD = "#0a0a0a";
const BORDER = "#1a1a1a";

type FeedRow = {
  id: string;
  type?: string;
  userId?: string;
  userName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  timestamp?: unknown;
  seen?: boolean;
};

function fmtTime(raw: unknown): string {
  if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().toLocaleString();
  }
  return "—";
}

export function AdminLiveFeedTab() {
  const [rows, setRows] = useState<FeedRow[]>([]);

  useEffect(() => {
    if (!app) return;
    const db = getFirestore(app);
    const qy = query(collection(db, "activityFeed"), orderBy("timestamp", "desc"), limit(200));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedRow, "id">) })));
      },
      () => setRows([]),
    );
    return () => unsub();
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Real-time platform events (populated as users trigger actions). Older deployments may have an empty feed until events are logged.
      </p>
      <div
        className="max-h-[min(70vh,720px)] space-y-2 overflow-y-auto rounded-xl border p-3"
        style={{ background: CARD, borderColor: BORDER }}
      >
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No feed events yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="border-b border-zinc-800/80 py-2 text-sm last:border-0">
              <div className="text-[11px] text-zinc-500">{fmtTime(r.timestamp)}</div>
              <div className="mt-0.5 text-zinc-200">
                <span className="text-zinc-400">{r.type ?? "event"}</span> · {r.userName ?? r.userId ?? "—"}{" "}
                — {r.description ?? ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
