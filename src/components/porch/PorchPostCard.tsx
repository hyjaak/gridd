"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { doc, runTransaction, updateDoc } from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { PorchPost } from "@/types";
import {
  softDeletePorchPost,
  formatPorchTime,
  GRIDD_ORANGE,
  porchGridditCount,
  porchGridditUids,
  porchLikeCount,
  porchLikeUids,
  shareablePorchUrl,
  togglePorchGriddit,
  togglePorchLike,
} from "@/lib/porch-social";
import { PorchComments } from "@/components/porch/PorchComments";
import { PorchReportModal } from "@/components/porch/PorchReportModal";
import { makeConversationId } from "@/lib/dm-utils";
import type { User } from "firebase/auth";
import type { GriddProfile } from "@/providers/AuthProvider";
import type { UserRole } from "@/types";

function RolePill({ role }: { role: PorchPost["authorRole"] }) {
  if (role === "ceo" || role === "admin") {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
        style={{ background: "#ff6b00" }}
      >
        CEO 👑
      </span>
    );
  }
  if (role === "driver" || role === "provider") {
    return (
      <span className="rounded-full bg-emerald-600/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
        Driver
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-600/40 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
      Customer
    </span>
  );
}

type Props = {
  post: PorchPost;
  user: User | null;
  profile: GriddProfile | null;
  role: UserRole | null;
  commentsDefaultOpen?: boolean;
  onToast?: (msg: string) => void;
  /** From Firestore: user already submitted a report for this post */
  alreadyReported?: boolean;
  reporterDisplayName?: string;
  onEditPost: (post: PorchPost) => void;
};

export function PorchPostCard({
  post: p,
  user,
  profile,
  role,
  commentsDefaultOpen = false,
  onToast,
  alreadyReported = false,
  reporterDisplayName = "Member",
  onEditPost,
}: Props) {
  /** Detail permalink defaults open so long bodies aren’t clipped. */
  const [expandedBody, setExpandedBody] = useState(commentsDefaultOpen);
  const [commentsOpen, setCommentsOpen] = useState(commentsDefaultOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [burst, setBurst] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportedLocal, setReportedLocal] = useState(false);
  const [authorMenuOpen, setAuthorMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const authorMenuRef = useRef<HTMLDivElement>(null);

  const isAuthor = Boolean(user && p.authorUid === user.uid);
  const hasReported = alreadyReported || reportedLocal;
  const isCEO = role === "ceo";
  const liked = Boolean(user && porchLikeUids(p).includes(user.uid));
  const gridded = Boolean(user && porchGridditUids(p).includes(user.uid));
  const likeN = porchLikeCount(p);
  const griddN = porchGridditCount(p);
  const commentN = typeof p.commentCount === "number" ? p.commentCount : 0;
  const categoryLabel = (p.category ?? p.type ?? "post").toString();

  const debate =
    p.type === "debate" && p.votes && typeof p.votes === "object" && !Array.isArray(p.votes) && "yes" in p.votes && "no" in p.votes
      ? (p.votes as { yes: number; no: number })
      : null;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!authorMenuRef.current?.contains(e.target as Node)) setAuthorMenuOpen(false);
    }
    if (menuOpen || authorMenuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen, authorMenuOpen]);

  async function vote(choice: "yes" | "no") {
    if (!firebaseApp || !user) return;
    const postRef = doc(db, "porch", p.id);
    const ballotRef = doc(db, "porch", p.id, "votes", user.uid);
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      const ballotSnap = await tx.get(ballotRef);
      const row = postSnap.data() as PorchPost | undefined;
      const raw = row?.votes;
      const data =
        raw && typeof raw === "object" && !Array.isArray(raw) && "yes" in raw && "no" in raw
          ? (raw as { yes?: number; no?: number })
          : { yes: 0, no: 0 };
      let yes = data.yes ?? 0;
      let no = data.no ?? 0;
      const prev = ballotSnap.exists()
        ? (ballotSnap.data() as { choice?: string }).choice
        : undefined;
      if (prev === "yes") yes -= 1;
      if (prev === "no") no -= 1;
      if (choice === "yes") yes += 1;
      else no += 1;
      tx.set(ballotRef, { choice });
      tx.update(postRef, { votes: { yes, no } });
    });
  }

  async function onToggleLike() {
    if (!user) return;
    await togglePorchLike(p.id, user.uid);
  }

  async function onToggleGriddit() {
    if (!user) return;
    setBurst(true);
    window.setTimeout(() => setBurst(false), 600);
    await togglePorchGriddit(p.id, user.uid);
  }

  async function copyShare() {
    const url = shareablePorchUrl(p.id);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Check this out on GRIDD", url });
        onToast?.("Shared!");
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      onToast?.("Link copied! 🔗");
    } catch {
      onToast?.("Could not copy link.");
    }
  }

  async function togglePin() {
    if (!isCEO) return;
    await updateDoc(doc(db, "porch", p.id), { pinned: !p.pinned });
    setMenuOpen(false);
  }

  async function confirmDelete() {
    if (!user) return;
    try {
      await softDeletePorchPost(p.id, user.uid);
      setDeleteOpen(false);
      onToast?.("Post removed from the feed. Our team can still review it if needed.");
    } catch (e) {
      console.error(e);
      alert("Could not delete post.");
    }
  }

  return (
    <Card
      id={p.id}
      className={[
        "p-5",
        p.pinned ? "border-[#00FF88] ring-1 ring-[#00FF88]/40" : "",
        p.deleted && isCEO ? "border-amber-600/40 bg-amber-950/20" : "",
      ].join(" ")}
    >
      {p.deleted && isCEO ? (
        <div className="mb-3 rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          🗑️ Deleted post — retained for review. By {p.deletedByUid === p.authorUid ? "author" : p.deletedByUid ?? "—"}
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        {!isAuthor && user ? (
          <button
            type="button"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-black ring-offset-2 hover:ring-2 hover:ring-[#ff6b00]/50"
            style={{ background: "#D4A574" }}
            onClick={() => setAuthorMenuOpen((v) => !v)}
            aria-label="Author menu"
          >
            {p.authorPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.authorPhoto} alt="" className="h-full w-full object-cover" />
            ) : (
              (p.authorName?.slice(0, 1) ?? "?").toUpperCase()
            )}
          </button>
        ) : (
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-black"
            style={{ background: "#D4A574" }}
          >
            {p.authorPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.authorPhoto} alt="" className="h-full w-full object-cover" />
            ) : (
              (p.authorName?.slice(0, 1) ?? "?").toUpperCase()
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="relative flex min-w-0 flex-wrap items-center gap-2" ref={authorMenuRef}>
              {!isAuthor && user ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--text)] hover:text-[#ff6b00]"
                  onClick={() => setAuthorMenuOpen((v) => !v)}
                >
                  {p.authorName}
                </button>
              ) : (
                <span className="text-sm font-semibold text-[var(--text)]">{p.authorName}</span>
              )}
              <RolePill role={p.authorRole} />
              {typeof p.authorGriddScore === "number" && p.authorGriddScore > 0 ? (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-100/90 ring-1 ring-amber-500/30">
                  GRIDD {Math.round(p.authorGriddScore)}
                </span>
              ) : null}
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] capitalize text-[var(--sub)]">
                {categoryLabel}
              </span>
              {p.pinned ? (
                <span className="text-[10px] text-[#00FF88]">📌 Pinned</span>
              ) : null}
              {p.edited ? (
                <span className="text-[10px] text-[var(--sub)]">edited</span>
              ) : null}
              <span className="text-[10px] text-[var(--sub)]">{formatPorchTime(p.createdAt)}</span>
              {authorMenuOpen && user && !isAuthor ? (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-xl border border-[var(--border)] bg-[#111] py-1 shadow-xl">
                  <Link
                    href={`/porch/${p.id}`}
                    className="block px-3 py-2 text-sm text-[var(--text)] hover:bg-white/5"
                    onClick={() => setAuthorMenuOpen(false)}
                  >
                    View post
                  </Link>
                  <Link
                    href={`/dm/${makeConversationId(user.uid, p.authorUid)}`}
                    className="block px-3 py-2 text-sm font-semibold text-[#ff6b00] hover:bg-white/5"
                    onClick={() => setAuthorMenuOpen(false)}
                  >
                    💬 Message
                  </Link>
                </div>
              ) : null}
            </div>
            {isAuthor ? (
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-lg leading-none text-[var(--sub)] hover:bg-white/5"
                  aria-label="Post menu"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ⋮
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-xl border border-[var(--border)] bg-[#111] py-1 shadow-xl">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-white/5"
                      onClick={() => {
                        setMenuOpen(false);
                        onEditPost(p);
                      }}
                    >
                      ✏️ Edit post
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs text-rose-300 hover:bg-white/5"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteOpen(true);
                      }}
                    >
                      🗑️ Delete post
                    </button>
                    {isCEO ? (
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-white/5"
                        onClick={() => void togglePin()}
                      >
                        📌 {p.pinned ? "Unpin post" : "Pin post"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {p.type === "review" && typeof p.rating === "number" ? (
            <div className="mt-2 text-sm text-[#D4A574]">{"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}</div>
          ) : null}
          <div className="mt-2 text-base font-semibold text-[var(--text)]">{p.title}</div>
          {p.jobLocation ? (
            <div className="mt-1 text-xs text-[#00FF88]">📍 {p.jobLocation}</div>
          ) : null}
          {p.neighborhood || p.zipCode ? (
            <div className="mt-0.5 text-[10px] text-zinc-500">
              📍 {p.neighborhood ?? ""}
              {p.neighborhood && p.zipCode ? " · " : ""}
              {p.zipCode ?? ""}
            </div>
          ) : null}
          {typeof p.distanceMiles === "number" ? (
            <div className="mt-1 text-xs text-[#ff6b00]">
              {p.distanceMiles > 0 ? `${Math.round(p.distanceMiles)} miles away` : "In your hood"}
            </div>
          ) : null}
          {(() => {
            const raw = p.body ?? "";
            const isLong = raw.length > 200;
            const shown = isLong && !expandedBody ? `${raw.slice(0, 200)}…` : raw;
            return (
              <>
                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--sub)]">{shown}</div>
                {isLong ? (
                  <button
                    type="button"
                    className="mt-1 cursor-pointer border-none bg-transparent p-0 py-1 font-[family-name:var(--font-syne)] text-[12px] font-bold text-[#ff6b00]"
                    onClick={() => setExpandedBody((e) => !e)}
                  >
                    {expandedBody ? "Show less ↑" : "Read more ↓"}
                  </button>
                ) : null}
              </>
            );
          })()}

          {debate ? (
            <div className="mt-4 space-y-2">
              <div className="flex h-8 overflow-hidden rounded-lg">
                <div
                  className="flex items-center justify-center bg-emerald-600/80 text-xs font-semibold text-white"
                  style={{
                    width: `${(100 * debate.yes) / Math.max(1, debate.yes + debate.no)}%`,
                  }}
                >
                  Yes {debate.yes}
                </div>
                <div
                  className="flex items-center justify-center bg-rose-600/80 text-xs font-semibold text-white"
                  style={{
                    width: `${(100 * debate.no) / Math.max(1, debate.yes + debate.no)}%`,
                  }}
                >
                  No {debate.no}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="text-xs" onClick={() => void vote("yes")}>
                  Vote Yes
                </Button>
                <Button variant="secondary" className="text-xs" onClick={() => void vote("no")}>
                  Vote No
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={[
                "rounded-full border border-[var(--border)] px-2.5 py-1 text-xs transition",
                liked ? "border-red-500/50 text-red-500" : "text-[var(--sub)] hover:text-[var(--text)]",
              ].join(" ")}
              onClick={() => void onToggleLike()}
            >
              ❤️ {likeN}
            </button>

            <button
              type="button"
              className={[
                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                burst ? "animate-gridd-burst" : "",
                gridded ? "text-white" : "border-2 bg-transparent text-white",
              ].join(" ")}
              style={{
                borderColor: GRIDD_ORANGE,
                background: gridded ? GRIDD_ORANGE : "transparent",
                transform: "scale(1.06)",
              }}
              onClick={() => void onToggleGriddit()}
            >
              ‼️ GRIDD IT {griddN}
            </button>

            <button
              type="button"
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--sub)] hover:text-[var(--text)]"
              onClick={() => setCommentsOpen((o) => !o)}
            >
              💬 {commentN}
            </button>

            <button
              type="button"
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--sub)] hover:text-[var(--text)]"
              onClick={() => void copyShare()}
            >
              🔁 Share
            </button>

            {!isAuthor ? (
              <button
                type="button"
                disabled={hasReported || !user}
                className={[
                  "text-xs",
                  hasReported ? "cursor-not-allowed text-zinc-600" : "text-[var(--sub)] hover:text-[var(--text)]",
                ].join(" ")}
                onClick={() => {
                  if (hasReported || !user) return;
                  setReportOpen(true);
                }}
              >
                {hasReported ? "Reported 🚩" : "🚩 Report"}
              </button>
            ) : null}
          </div>

          {isAuthor ? (
            <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--border)] pt-3 text-xs">
              <button
                type="button"
                className="text-[var(--sub)] hover:text-[#00FF88]"
                onClick={() => onEditPost(p)}
              >
                ✏️ Edit
              </button>
              <button type="button" className="text-[var(--sub)] hover:text-rose-400" onClick={() => setDeleteOpen(true)}>
                🗑️ Delete
              </button>
            </div>
          ) : null}

          {commentsOpen ? <PorchComments postId={p.id} user={user} profile={profile} /> : null}
        </div>
      </div>

      {deleteOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4">
          <Card className="max-w-sm p-5">
            <div className="text-sm font-semibold text-[var(--text)]">Delete this post?</div>
            <p className="mt-2 text-xs text-[var(--sub)]">
              Hides it from the feed for you and neighbors. CEO review may still apply for safety.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-rose-600 text-white hover:bg-rose-500"
                onClick={() => void confirmDelete()}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {reportOpen && user ? (
        <PorchReportModal
          open={reportOpen}
          post={p}
          reporterName={reporterDisplayName}
          onClose={() => setReportOpen(false)}
            onSuccess={() => {
            setReportedLocal(true);
            onToast?.("Report submitted ✅\nWe'll review within 24 hours");
          }}
          onError={(msg) => onToast?.(msg)}
        />
      ) : null}
    </Card>
  );
}
