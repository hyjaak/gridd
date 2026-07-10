"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { blockUser } from "@/lib/admin-firestore";

type AlertDoc = {
  id: string;
  severity?: "critical" | "warning" | "info";
  title?: string;
  body?: string;
  uid?: string;
  createdAt?: unknown;
};

export default function AdminSecurityPage() {
  const [items, setItems] = useState<AlertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "alerts"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setErr(null);
        setLoading(false);
        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AlertDoc, "id">),
          })),
        );
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  async function block(uid: string | undefined) {
    if (!uid) return;
    setBlocking(uid);
    try {
      await blockUser(uid);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to block");
    } finally {
      setBlocking(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">CEO · Security</h1>
        <p className="mt-1 text-sm text-zinc-400">Alerts from Firestore /alerts</p>
      </div>

      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-800/80" />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-300">
          All Clear ✅
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li
              key={a.id}
              className={[
                "rounded-2xl border bg-zinc-900/60 p-4",
                a.severity === "critical"
                  ? "border-red-500/60 ring-2 ring-red-500/40"
                  : "border-zinc-800",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-zinc-100">{a.title ?? "Alert"}</div>
                  <div className="mt-1 text-sm text-zinc-400">{a.body}</div>
                  {a.uid ? (
                    <div className="mt-2 font-mono text-xs text-zinc-500">uid: {a.uid}</div>
                  ) : null}
                </div>
                {a.uid ? (
                  <button
                    type="button"
                    disabled={blocking === a.uid}
                    onClick={() => void block(a.uid)}
                    className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
                  >
                    {blocking === a.uid ? "…" : "Block"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
