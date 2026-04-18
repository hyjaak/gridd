"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireSignedIn } from "@/hooks/useRequireSignedIn";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PorchPost, PorchPostType, UserRole } from "@/types";
import { CustomerNav } from "@/components/CustomerNav";
import { DriverNav } from "@/components/DriverNav";
import { NotificationBell } from "@/components/NotificationBell";
import { BackButton } from "@/components/BackButton";

const FILTERS: Array<{ id: "all" | PorchPostType; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "⭐ Reviews" },
  { id: "debate", label: "🗳️ Debates" },
  { id: "shoutout", label: "🏆 Shoutouts" },
  { id: "announcement", label: "📢 Announcements" },
];

function timeAgo(iso: unknown) {
  let t: number;
  if (iso && typeof iso === "object" && "toDate" in iso && typeof (iso as { toDate: () => Date }).toDate === "function") {
    t = (iso as { toDate: () => Date }).toDate().getTime();
  } else if (typeof iso === "string") {
    t = new Date(iso).getTime();
  } else {
    return "—";
  }
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function roleBadge(role: PorchPost["authorRole"]) {
  if (role === "admin") return "GRIDD";
  if (role === "driver") return "Provider";
  return "Customer";
}

export default function CustomerPorchPage() {
  const { loading: gateLoading, ok } = useRequireSignedIn();
  const { user, profile, role } = useAuth();
  const [posts, setPosts] = useState<PorchPost[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [postType, setPostType] = useState<PorchPostType>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!firebaseApp) return;
    const q = query(collection(db, "porch"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: PorchPost[] = snap.docs.map((d) => {
          const data = d.data() as Omit<PorchPost, "id">;
          return { id: d.id, ...data };
        });
        setPosts(rows);
      },
      () => setPosts([]),
    );
    return () => unsub();
  }, []);

  const todayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return posts.filter((p) => new Date(p.createdAt).getTime() >= start.getTime()).length;
  }, [posts]);

  const visible = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.type === filter);
  }, [posts, filter]);

  async function handlePost() {
    if (!title.trim() || !body.trim()) {
      alert("Please fill in title and content");
      return;
    }
    if (!firebaseApp || !user) {
      alert("Please sign in first");
      return;
    }

    setPosting(true);
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const provSnap = await getDoc(doc(db, "providers", user.uid));
      const pdata = userSnap.exists()
        ? userSnap.data()
        : provSnap.exists()
          ? provSnap.data()
          : null;
      const authorName =
        (pdata?.name as string | undefined) ?? profile?.name ?? user.email ?? "Neighbor";
      const authorRole: PorchPost["authorRole"] =
        role === "admin" ? "admin" : role === "driver" ? "driver" : "customer";

      await addDoc(collection(db, "porch"), {
        type: postType,
        title: title.trim(),
        body: body.trim(),
        authorUid: user.uid,
        authorName,
        authorRole,
        createdAt: serverTimestamp(),
        votes: postType === "debate" ? { yes: 0, no: 0 } : undefined,
        likeUids: [],
        commentCount: 0,
        pinned: false,
        rating: postType === "review" ? rating : undefined,
      });

      setTitle("");
      setBody("");
      setPostType("post");
      setComposerOpen(false);
    } catch (err: unknown) {
      console.error("Post failed:", err);
      alert(err instanceof Error ? `Could not post: ${err.message}` : "Could not post.");
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(post: PorchPost) {
    if (!firebaseApp || !user) return;
    const ref = doc(db, "porch", post.id);
    const likes = new Set(post.likeUids ?? []);
    if (likes.has(user.uid)) likes.delete(user.uid);
    else likes.add(user.uid);
    await updateDoc(ref, { likeUids: Array.from(likes) });
  }

  async function vote(post: PorchPost, choice: "yes" | "no") {
    if (!firebaseApp || !user) return;
    const postRef = doc(db, "porch", post.id);
    const ballotRef = doc(db, "porch", post.id, "votes", user.uid);
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      const ballotSnap = await tx.get(ballotRef);
      const row = postSnap.data() as PorchPost | undefined;
      const data = row?.votes ?? { yes: 0, no: 0 };
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

  async function report(postId: string) {
    if (!firebaseApp || !user) return;
    await addDoc(collection(db, "porchReports"), {
      postId,
      reporterUid: user.uid,
      createdAt: new Date().toISOString(),
    });
  }

  async function sharePost(p: PorchPost) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/porch#${p.id}` : "";
    if (navigator.share) {
      await navigator.share({ title: p.title, text: p.body.slice(0, 140), url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
    }
  }

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-full bg-[#060606]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <BackButton href="/home" inline className="mt-0.5" />
            <div className="min-w-0">
            <div className="text-lg font-semibold" style={{ color: "#D4A574" }}>
              The Porch 🪑
            </div>
            <div className="text-xs text-[var(--sub)]">Where the neighborhood talks</div>
            <div className="mt-1 text-[10px] text-[var(--sub)]">{todayCount} posts today</div>
            </div>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 pb-36 pt-6">
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="w-full rounded-2xl border border-dashed border-[var(--border)] bg-[#0a0a0a] px-4 py-4 text-left text-sm text-[var(--sub)] hover:border-[#D4A574]"
        >
          What&apos;s on your mind?
        </button>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs",
                filter === f.id ? "border-[#D4A574] text-[#D4A574]" : "border-[var(--border)] text-[var(--sub)]",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {visible.map((p) => (
            <Card
              key={p.id}
              id={p.id}
              className={[
                "p-5",
                p.pinned ? "border-[#00FF88] ring-1 ring-[#00FF88]/40" : "",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-black"
                  style={{ background: "#D4A574" }}
                >
                  {p.authorName?.slice(0, 1)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text)]">{p.authorName}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--sub)]">
                      {roleBadge(p.authorRole)}
                    </span>
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--sub)]">
                      {p.type}
                    </span>
                    {p.pinned ? (
                      <span className="text-[10px] text-[#00FF88]">
                        📌 Pinned
                      </span>
                    ) : null}
                    <span className="text-[10px] text-[var(--sub)]">{timeAgo(p.createdAt)}</span>
                  </div>
                  {p.type === "review" && typeof p.rating === "number" ? (
                    <div className="mt-2 text-sm text-[#D4A574]">{"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}</div>
                  ) : null}
                  <div className="mt-2 text-base font-semibold text-[var(--text)]">{p.title}</div>
                  <div className="mt-2 text-sm text-[var(--sub)]">
                    {expanded[p.id] || (p.body?.length ?? 0) < 200
                      ? p.body
                      : `${p.body?.slice(0, 200)}…`}
                  </div>
                  {(p.body?.length ?? 0) >= 200 ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-[#00FF88] hover:underline"
                      onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
                    >
                      {expanded[p.id] ? "Show less" : "Read more"}
                    </button>
                  ) : null}

                  {p.type === "debate" && p.votes ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex h-8 overflow-hidden rounded-lg">
                        <div
                          className="flex items-center justify-center bg-emerald-600/80 text-xs font-semibold text-white"
                          style={{
                            width: `${(100 * p.votes.yes) / Math.max(1, p.votes.yes + p.votes.no)}%`,
                          }}
                        >
                          Yes {p.votes.yes}
                        </div>
                        <div
                          className="flex items-center justify-center bg-rose-600/80 text-xs font-semibold text-white"
                          style={{
                            width: `${(100 * p.votes.no) / Math.max(1, p.votes.yes + p.votes.no)}%`,
                          }}
                        >
                          No {p.votes.no}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" className="text-xs" onClick={() => void vote(p, "yes")}>
                          Vote Yes
                        </Button>
                        <Button variant="secondary" className="text-xs" onClick={() => void vote(p, "no")}>
                          Vote No
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="ghost" className="text-xs" onClick={() => void toggleLike(p)}>
                      ❤️ {p.likeUids?.length ?? 0}
                    </Button>
                    <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--sub)]">
                      💬 {p.commentCount ?? 0}
                    </span>
                    <Button variant="ghost" className="text-xs" onClick={() => void sharePost(p)}>
                      Share
                    </Button>
                    <Button variant="ghost" className="text-xs" onClick={() => void report(p.id)}>
                      Report
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--text)]">New post</div>
              <button type="button" className="text-[var(--sub)]" onClick={() => setComposerOpen(false)}>
                ✕
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["post", "review", "debate", "shoutout"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPostType(t)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs capitalize",
                    postType === t ? "border-[#D4A574] text-[#D4A574]" : "border-[var(--border)] text-[var(--sub)]",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-xs text-[var(--sub)]">Title</div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            </div>
            {postType === "review" ? (
              <div className="mt-3">
                <div className="text-xs text-[var(--sub)]">Rating</div>
                <div className="mt-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} className="text-lg text-[#D4A574]">
                      {n <= rating ? "★" : "☆"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3">
              <div className="text-xs text-[var(--sub)]">Body</div>
              <textarea
                className="mt-1 min-h-[120px] w-full rounded-xl border border-[var(--border)] bg-[#0a0a0a] px-3 py-2 text-sm text-[var(--text)]"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write something…"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setComposerOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={posting || !body.trim() || !title.trim()}
                onClick={() => void handlePost()}
              >
                {posting ? "Posting…" : "Submit"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {role === "driver" ? <DriverNav /> : <CustomerNav />}
    </main>
  );
}
