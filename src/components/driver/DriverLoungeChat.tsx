"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase";
import { dmTimeAgo } from "@/lib/dm-utils";
import { inActiveDemo, canGoOnline, isFullyApprovedDriver } from "@/lib/driver-gate";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";
import type { DriverLoungeMessage, Provider } from "@/types";
import { BackButton } from "@/components/BackButton";
import { DriverNav } from "@/components/DriverNav";
import type { UserRole } from "@/types";

const LOBBY_ID = "main" as const;

const PINNED_TEXT = `📌 CEO pinned:
"Welcome to the GRIDD Driver Lounge! Real ones only. Keep it 💯
— CEO 👑"`;

function starRow(n: number) {
  const s = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(s) + "☆".repeat(5 - s);
}

type Props = { userId: string | undefined; provider: Provider | null; role: UserRole | null };

export function DriverLoungeChat({ userId, provider, role }: Props) {
  const [rows, setRows] = useState<DriverLoungeMessage[]>([]);
  const [memberApprox, setMemberApprox] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCeo = role === "ceo";
  const canSee = isCeo || Boolean(provider && canGoOnline(provider));
  const isDemo = Boolean(provider && inActiveDemo(provider));
  const canPost = Boolean(provider && isFullyApprovedDriver(provider));
  const canLike = canPost;

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  useEffect(() => {
    if (!firebaseApp || !canSee) return;
    const qy = query(
      collection(doc(db, "driverLounge", LOBBY_ID), "messages"),
      where("deleted", "==", false),
      orderBy("createdAt", "asc"),
      limit(100),
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: DriverLoungeMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DriverLoungeMessage, "id">),
        }));
        setRows(list);
        scrollToBottom();
      },
      (err) => {
        console.error(err);
        setRows([]);
        showToast("Could not load messages.");
      },
    );
    return () => unsub();
  }, [canSee, scrollToBottom, showToast]);

  useEffect(() => {
    if (!firebaseApp || !canSee) return;
    void (async () => {
      try {
        const qy = query(
          collection(db, "providers"),
          where("accountStatus", "==", "approved"),
          where("approvedByCEO", "==", true),
        );
        const c = await getCountFromServer(qy);
        setMemberApprox(c.data().count);
      } catch {
        setMemberApprox(null);
      }
    })();
  }, [canSee]);

  const visibleMsgs = useMemo(
    () => (isCeo ? rows : rows.filter((m) => !m.deleted)),
    [rows, isCeo],
  );

  useEffect(() => {
    scrollToBottom();
  }, [rows.length, scrollToBottom]);

  async function send() {
    const t = text.trim();
    if (!t || !userId) return;
    if (!canPost) {
      showToast("Only fully approved drivers can post.");
      return;
    }
    setBusy(true);
    try {
      const driverRef = doc(db, "providers", userId);
      const driverDoc = await getDoc(driverRef);
      const d = driverDoc.data() as Provider | undefined;
      if (
        !driverDoc.exists() ||
        d?.accountStatus !== "approved" ||
        d?.approvedByCEO !== true ||
        d?.documentsSubmitted !== true
      ) {
        showToast("Only approved drivers with CEO sign-off can post.");
        return;
      }

      await addDoc(
        collection(doc(db, "driverLounge", LOBBY_ID), "messages"),
        sanitizeForFirestore({
          senderId: userId,
          senderName: d.name ?? "Driver",
          senderPhoto: d.photoUrl && String(d.photoUrl).trim() ? d.photoUrl : null,
          senderRating: typeof d.rating === "number" ? d.rating : 5,
          text: t,
          createdAt: serverTimestamp(),
          likes: [] as string[],
          likeCount: 0,
          deleted: false,
        } as Record<string, unknown>),
      );
      setText("");
      scrollToBottom();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      showToast("Failed to send: " + msg);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(m: DriverLoungeMessage) {
    if (!userId || !canLike) return;
    const ref = doc(db, "driverLounge", LOBBY_ID, "messages", m.id);
    const arr = Array.isArray(m.likes) ? m.likes : [];
    const has = arr.includes(userId);
    try {
      await updateDoc(ref, { likes: has ? arrayRemove(userId) : arrayUnion(userId) } as Record<string, unknown>);
    } catch (e) {
      console.error(e);
    }
  }

  async function removeMsg(m: DriverLoungeMessage) {
    if (!isCeo) return;
    if (!window.confirm("Remove this message for everyone?")) return;
    try {
      await updateDoc(doc(db, "driverLounge", LOBBY_ID, "messages", m.id), { deleted: true });
    } catch (e) {
      console.error(e);
    }
  }

  const inputPlaceholder = isDemo
    ? "Go fully live to post in the Driver Lounge 🔒"
    : canPost
      ? "Message the lounge…"
      : "Read-only — fully approved drivers can post";

  if (!canSee) {
    return (
      <main className="min-h-screen bg-[#060606] pb-28 text-center text-zinc-500">
        <p className="px-6 pt-24 text-sm">Driver Lounge is for active drivers on the network.</p>
        <DriverNav />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#060606] pb-28">
      {toast ? (
        <div className="fixed top-3 left-1/2 z-[60] max-w-sm -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-900/95 px-4 py-2 text-center text-sm text-zinc-100 shadow-lg backdrop-blur">
          {toast}
        </div>
      ) : null}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href="/dm" inline />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ background: "#1a1a1a" }}
            >
              🚛
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-[var(--text)]">Driver Lounge</h1>
              <p className="text-xs text-[var(--sub)]">
                {memberApprox != null ? `${memberApprox} drivers` : "Drivers on GRIDD"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 pt-4">
        <div className="mb-4 rounded-xl border border-[#ff6b00]/30 bg-gradient-to-b from-[#ff6b00]/12 to-[#0a0a0a]/30 px-3 py-3 text-xs leading-relaxed text-zinc-200 whitespace-pre-line">
          {PINNED_TEXT}
        </div>
        <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">
          Group chat — for 1:1, use DMs or Porch. Pinned by CEO; not interactive.
        </p>
        <div className="space-y-3 pb-4">
          {visibleMsgs.map((m) => {
            const likes = Array.isArray(m.likes) ? m.likes : [];
            const likeN = likes.length;
            const liked = Boolean(userId && likes.includes(userId));
            return (
              <div
                key={m.id}
                className={[
                  "rounded-xl border px-3 py-2.5",
                  m.deleted ? "border-red-500/30 bg-red-500/5 opacity-70" : "border-[var(--border)] bg-[#0a0a0a]",
                ].join(" ")}
              >
                <div className="flex items-start gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-xs font-bold text-white">
                    {m.senderPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.senderPhoto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (m.senderName?.slice(0, 1) ?? "?").toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text)]">{m.senderName}</span>
                      <span className="text-[10px] text-amber-400/90">
                        {starRow(typeof m.senderRating === "number" ? m.senderRating : 5)}
                      </span>
                      <span className="text-[10px] text-zinc-500">{dmTimeAgo(m.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{m.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!canLike}
                        onClick={() => void toggleLike(m)}
                        className={[
                          "text-xs",
                          canLike ? "text-zinc-300 hover:text-rose-300" : "cursor-not-allowed text-zinc-600",
                          liked ? "text-rose-400" : "",
                        ].join(" ")}
                      >
                        ❤️ {likeN}
                      </button>
                      {isCeo ? (
                        <button
                          type="button"
                          onClick={() => void removeMsg(m)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-20 border-t border-[var(--border)] bg-[#0a0a0a]/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={inputPlaceholder}
            disabled={!canPost || busy || isDemo}
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[#111] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#ff6b00] disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            disabled={!canPost || busy || isDemo || !text.trim()}
            onClick={() => void send()}
            className="shrink-0 rounded-xl bg-[#ff6b00] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>

      <DriverNav />
    </main>
  );
}
