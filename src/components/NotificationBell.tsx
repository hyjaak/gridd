"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { GriddNotification } from "@/types";

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GriddNotification[]>([]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setItems([]);
      return;
    }
    const db = getFirestore(firebaseApp);
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const data = d.data() as Omit<GriddNotification, "id">;
            return { id: d.id, ...data };
          }),
        );
      },
      () => setItems([]),
    );
    return () => unsub();
  }, [user?.uid]);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  async function markRead(id: string) {
    if (!firebaseApp) return;
    const db = getFirestore(firebaseApp);
    await updateDoc(doc(db, "notifications", id), { read: true });
  }

  async function markAllRead() {
    if (!firebaseApp || items.length === 0) return;
    const db = getFirestore(firebaseApp);
    const batch = writeBatch(db);
    items.filter((n) => !n.read).forEach((n) => {
      batch.update(doc(db, "notifications", n.id), { read: true });
    });
    await batch.commit();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-[var(--border)] bg-[#0a0a0a] p-2 text-[var(--text)] hover:border-[#00FF88]"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default bg-black/40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,380px)] rounded-2xl border border-[var(--border)] bg-[#0a0a0a] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--text)]">Notifications</div>
              <button
                type="button"
                className="text-xs text-[#00FF88] hover:underline"
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-[min(70vh,420px)] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--sub)]">No notifications yet.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className={[
                      "flex w-full gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-0",
                      n.read ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    <span className="text-xl">{n.icon ?? "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-[var(--text)]">{n.title}</div>
                        {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#00FF88]" /> : null}
                      </div>
                      <div className="mt-1 text-xs text-[var(--sub)]">{n.body}</div>
                      <div className="mt-1 text-[10px] text-[var(--sub)]">{timeAgo(n.createdAt)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
