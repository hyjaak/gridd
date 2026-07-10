"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { firebaseAuth } from "@/lib/firebase";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";
import { useRequireSignedIn } from "@/hooks/useRequireSignedIn";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CustomerNav } from "@/components/CustomerNav";
import { DriverNav } from "@/components/DriverNav";
import { BackButton } from "@/components/BackButton";
import { DmConsentModal, hasDmConsent, setDmConsent } from "@/components/dm/DmConsentModal";
import { dmTimeAgo, lastMessageAtToMs, makeConversationId, truncateDmPreview } from "@/lib/dm-utils";
import type { DmConversation } from "@/types";

type SearchHit = { uid: string; name: string; photo: string | null; role: "customer" | "driver" };

export default function DmInboxPage() {
  const { loading: gateLoading, ok } = useRequireSignedIn();
  const { user, role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState(false);
  const [rows, setRows] = useState<(DmConversation & { id: string })[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);

  useEffect(() => {
    setConsent(hasDmConsent());
  }, []);

  const withUid = searchParams.get("with")?.trim();

  useEffect(() => {
    if (!user?.uid || !withUid || withUid === user.uid) return;
    const id = makeConversationId(user.uid, withUid);
    router.replace(`/dm/${id}`);
  }, [user?.uid, withUid, router]);

  /** `array-contains` only — sort client-side so the inbox works even if the composite index is not deployed. */
  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setRows([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setListError(null);
    const db = getFirestore(firebaseApp);
    const qy = query(
      collection(db, "conversations"),
      where("participants", "array-contains", user.uid),
      limit(400),
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmConversation, "id">) }));
        setRows(list as (DmConversation & { id: string })[]);
        setListLoading(false);
        setListError(null);
      },
      (err) => {
        console.error("[dm inbox]", err);
        setRows([]);
        setListLoading(false);
        setListError(err.message || "Could not load conversations");
      },
    );
    return () => unsub();
  }, [user?.uid]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => lastMessageAtToMs(b.lastMessageAt) - lastMessageAtToMs(a.lastMessageAt));
  }, [rows]);

  const visible = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    return sortedRows.filter((r) => {
      if (r.hiddenForUsers?.includes(user?.uid ?? "")) return false;
      if (!qq) return true;
      const names = Object.values(r.participantNames ?? {})
        .join(" ")
        .toLowerCase();
      const last = (r.lastMessage ?? "").toLowerCase();
      return names.includes(qq) || last.includes(qq);
    });
  }, [sortedRows, searchQuery, user?.uid]);

  /** When no conversation matches the query, search users to start a new DM (same API as before). */
  useEffect(() => {
    const t = searchQuery.trim();
    if (t.length < 2 || visible.length > 0) {
      setSearchHits([]);
      setSearchBusy(false);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      setSearchBusy(true);
      void (async () => {
        try {
          const token = await firebaseAuth?.currentUser?.getIdToken();
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(t)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const j = (await res.json()) as {
            ok?: boolean;
            results?: SearchHit[];
          };
          if (!cancelled && j.ok && Array.isArray(j.results)) setSearchHits(j.results);
        } catch {
          if (!cancelled) setSearchHits([]);
        } finally {
          if (!cancelled) setSearchBusy(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [searchQuery, visible.length]);

  if (gateLoading || !ok) return <LoadingScreen />;

  if (!consent) {
    return (
      <main className="min-h-screen bg-[#060606]">
        <DmConsentModal
          onAgree={() => {
            setDmConsent();
            setConsent(true);
          }}
        />
      </main>
    );
  }

  const totalUnread = rows.reduce((acc, r) => {
    if (r.hiddenForUsers?.includes(user?.uid ?? "")) return acc;
    const n = user?.uid ? r.unreadCount?.[user.uid] : 0;
    return acc + (typeof n === "number" ? n : 0);
  }, 0);

  const showPeopleRow = searchQuery.trim().length >= 2 && visible.length === 0;

  return (
    <main className="min-h-screen bg-[#060606] pb-28">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href={role === "driver" ? "/driver/jobs" : "/home"} inline />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-[var(--text)]">Messages</h1>
            {totalUnread > 0 ? (
              <p className="text-xs text-[#ff6b00]">{totalUnread} unread</p>
            ) : (
              <p className="text-xs text-[var(--sub)]">Direct messages</p>
            )}
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-lg px-0">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations or people…"
            className="w-full rounded-xl border border-[var(--border)] bg-[#111] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#ff6b00]"
          />
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-4">
        {role === "driver" ? (
          <Link
            href="/driver/lounge"
            className="mb-4 flex items-center gap-3 rounded-2xl border border-[#ff6b00]/40 bg-[#ff6b00]/10 px-4 py-3 transition hover:bg-[#ff6b00]/15"
          >
            <span className="text-2xl" aria-hidden>
              🚛
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text)]">Driver Lounge 🚛</div>
              <div className="text-xs text-[var(--sub)]">Group chat for approved drivers</div>
            </div>
            <span className="shrink-0 text-zinc-500">›</span>
          </Link>
        ) : null}
        {listError ? (
          <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{listError}</p>
        ) : null}
        {listLoading ? <p className="py-8 text-center text-sm text-zinc-500">Loading conversations…</p> : null}

        {showPeopleRow ? (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[#0a0a0a] p-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Search users {searchBusy ? "…" : "— tap to message"}
            </div>
            {searchHits.length === 0 && !searchBusy ? (
              <p className="px-2 py-3 text-xs text-zinc-500">No users match that name.</p>
            ) : null}
            {searchHits.map((h) => (
              <Link
                key={h.uid}
                href={`/dm/${makeConversationId(user?.uid ?? "", h.uid)}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#222] text-sm font-bold text-white">
                  {h.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.photo} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    h.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[var(--text)]">{h.name}</span>
                    <span
                      className={[
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        h.role === "driver" ? "bg-amber-500/20 text-amber-200" : "bg-zinc-700 text-zinc-300",
                      ].join(" ")}
                    >
                      {h.role === "driver" ? "Driver" : "Member"}
                    </span>
                  </div>
                  <div className="text-xs text-[#ff6b00]">Open conversation</div>
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        {!listLoading && visible.length === 0 && !showPeopleRow ? (
          <div className="py-16 text-center text-[var(--sub)]">
            <div className="text-4xl">💬</div>
            <p className="mt-4 text-sm font-medium text-zinc-300">No messages yet</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed">
              Start a conversation from someone&apos;s Porch post, or type at least two letters to search for someone.
            </p>
          </div>
        ) : null}

        {!listLoading && visible.length > 0 ? (
          <ul className="space-y-1">
            {visible.map((r) => {
              const other = r.participants.find((p) => p !== user?.uid) ?? "";
              const name = r.participantNames?.[other] ?? "Chat";
              const photo = r.participantPhotos?.[other] ?? null;
              const unread = user?.uid ? (r.unreadCount?.[user.uid] ?? 0) : 0;
              const rawPreview = (r.lastMessage ?? "").trim();
              const preview =
                !rawPreview && name
                  ? `Say something to ${name}…`
                  : rawPreview
                    ? truncateDmPreview(r.lastMessage || "")
                    : "Say something…";
              return (
                <li key={r.id}>
                  <Link
                    href={`/dm/${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-3 hover:border-[var(--border)] hover:bg-[#0a0a0a]"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#222] text-base font-bold text-white">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-[var(--text)]">{name}</span>
                        <span className="shrink-0 text-[10px] text-zinc-500">{dmTimeAgo(r.lastMessageAt)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-zinc-500">{preview}</span>
                        {unread > 0 ? (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#ff6b00] px-1 text-[10px] font-bold text-black">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {role === "driver" ? <DriverNav /> : <CustomerNav />}
    </main>
  );
}
