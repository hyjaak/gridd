"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PorchComment } from "@/types";
import {
  addPorchComment,
  deletePorchComment,
  formatPorchTime,
  toggleCommentLike,
  toTimeMs,
} from "@/lib/porch-social";
import type { User } from "firebase/auth";
import type { GriddProfile } from "@/providers/AuthProvider";

type Props = {
  postId: string;
  user: User | null;
  profile: GriddProfile | null;
};

function commentLikeUids(c: PorchComment): string[] {
  return Array.isArray(c.likes) ? c.likes : [];
}

function commentLikeCount(c: PorchComment): number {
  if (typeof c.likeCount === "number") return c.likeCount;
  return commentLikeUids(c).length;
}

export function PorchComments({ postId, user, profile }: Props) {
  const [comments, setComments] = useState<PorchComment[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<PorchComment | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!firebaseApp) return;
    const q = query(collection(db, "porch", postId, "comments"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: PorchComment[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PorchComment, "id">),
        }));
        setComments(rows);
      },
      () => setComments([]),
    );
    return () => unsub();
  }, [postId]);

  const { roots, repliesByParent } = useMemo(() => {
    const sorted = [...comments].sort((a, b) => toTimeMs(a.createdAt) - toTimeMs(b.createdAt));
    const roots = sorted.filter((c) => !c.parentCommentId);
    const repliesByParent: Record<string, PorchComment[]> = {};
    sorted.forEach((c) => {
      const pid = c.parentCommentId;
      if (!pid) return;
      if (!repliesByParent[pid]) repliesByParent[pid] = [];
      repliesByParent[pid].push(c);
    });
    return { roots, repliesByParent };
  }, [comments]);

  async function resolveAuthorName(): Promise<string> {
    if (!user) return "Neighbor";
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const provSnap = await getDoc(doc(db, "providers", user.uid));
    const pdata = userSnap.exists() ? userSnap.data() : provSnap.exists() ? provSnap.data() : null;
    return String(
      (pdata?.name as string | undefined) ?? profile?.name ?? user.displayName ?? user.email ?? "Neighbor",
    );
  }

  async function submit() {
    const t = text.trim();
    if (!t || !user || !firebaseApp) return;
    setPosting(true);
    try {
      const authorName = await resolveAuthorName();
      await addPorchComment(postId, {
        authorId: user.uid,
        authorName,
        authorPhoto: user.photoURL ?? null,
        text: t,
        parentCommentId: replyTo ? replyTo.id : null,
      });
      setText("");
      setReplyTo(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not post comment.");
    } finally {
      setPosting(false);
    }
  }

  function CommentRow({
    c,
    depth,
  }: {
    c: PorchComment;
    depth: 0 | 1;
  }) {
    const liked = user ? commentLikeUids(c).includes(user.uid) : false;
    const isAuthor = user?.uid === c.authorId;
    const canReply = depth === 0;

    return (
      <div
        className={[
          "rounded-lg border border-[var(--border)] bg-black/30 p-3",
          depth === 1 ? "ml-6 border-l-2 border-[#D4A574]/40" : "",
        ].join(" ")}
      >
        <div className="flex gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black"
            style={{ background: "#D4A574" }}
          >
            {c.authorPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.authorPhoto} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              (c.authorName?.slice(0, 1) ?? "?").toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">{c.authorName}</span>
              <span className="text-[10px] text-[var(--sub)]">{formatPorchTime(c.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--sub)]">{c.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={[
                  "text-xs",
                  liked ? "text-red-500" : "text-[var(--sub)] hover:text-[var(--text)]",
                ].join(" ")}
                onClick={() => {
                  if (!user) return;
                  void toggleCommentLike(postId, c.id, user.uid);
                }}
              >
                ❤️ {commentLikeCount(c)}
              </button>
              {canReply ? (
                <button
                  type="button"
                  className="text-xs text-[#00FF88] hover:underline"
                  onClick={() => setReplyTo(c)}
                >
                  Reply
                </button>
              ) : null}
              {isAuthor ? (
                <button
                  type="button"
                  className="text-xs text-rose-400 hover:underline"
                  onClick={() => {
                    if (!confirm("Delete this comment?")) return;
                    void deletePorchComment(postId, c.id).catch((e) => {
                      console.error(e);
                      alert("Could not delete.");
                    });
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <div className="space-y-2">
        {roots.length === 0 ? (
          <div className="text-xs text-[var(--sub)]">No comments yet — start the thread.</div>
        ) : (
          roots.map((c) => (
            <div key={c.id} className="space-y-2">
              <CommentRow c={c} depth={0} />
              {(repliesByParent[c.id] ?? []).map((r) => (
                <CommentRow key={r.id} c={r} depth={1} />
              ))}
            </div>
          ))
        )}
      </div>

      {replyTo ? (
        <div className="text-xs text-[#00FF88]">
          Replying to {replyTo.authorName}{" "}
          <button type="button" className="underline" onClick={() => setReplyTo(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button variant="secondary" type="button" disabled={posting || !text.trim()} onClick={() => void submit()}>
          ➤
        </Button>
      </div>
    </div>
  );
}
