"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [droppedConfirm, setDroppedConfirm] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileAttachRef = useRef<HTMLInputElement>(null);

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

  async function persistPorchPost(): Promise<boolean> {
    const bodyText = body.trim();
    if (!bodyText) {
      alert("Write something first.");
      return false;
    }
    if (!firebaseApp || !user) {
      alert("Please sign in first");
      return false;
    }

    const effectiveTitle =
      title.trim() || bodyText.slice(0, 80).replace(/\s+/g, " ").trim() || "Post";

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
        title: effectiveTitle,
        body: bodyText,
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

      return true;
    } catch (err: unknown) {
      console.error("Post failed:", err);
      alert(err instanceof Error ? `Could not post: ${err.message}` : "Could not post.");
      return false;
    } finally {
      setPosting(false);
    }
  }

  async function handleDropIt() {
    if (posting) return;
    const ok = await persistPorchPost();
    if (!ok) return;
    setDroppedConfirm(true);
    window.setTimeout(() => {
      setDroppedConfirm(false);
      setTitle("");
      setBody("");
      setPostType("post");
      setComposerOpen(false);
    }, 1600);
  }

  function attachTag() {
    setBody((b) => {
      const t = b.trim();
      return t ? `${t} #` : "#";
    });
  }

  function attachLocationHint() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setBody((b) => `${b}${b ? "\n" : ""}📍 Location: (enable location in browser)`);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setBody(
          (b) =>
            `${b}${b ? "\n" : ""}📍 Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        );
      },
      () => {
        setBody((b) => `${b}${b ? "\n" : ""}📍 Location: unavailable — add details in text`);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
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
        <div
          role="button"
          tabIndex={0}
          onClick={() => setComposerOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setComposerOpen(true);
            }
          }}
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #00FF88, #00CC66)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 900,
              color: "#000",
            }}
          >
            ✏️
          </div>
          <span style={{ color: "#555", fontSize: 13 }}>
            What&apos;s on your mind? Share with the neighborhood...
          </span>
        </div>

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

      {!composerOpen ? (
        <button
          type="button"
          aria-label="New post"
          onClick={() => setComposerOpen(true)}
          style={{
            position: "fixed",
            bottom: 80,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00FF88, #00CC66)",
            border: "none",
            boxShadow: "0 4px 20px #00FF8866",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            zIndex: 100,
          }}
        >
          ✏️
        </button>
      ) : null}

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
            <input
              ref={fileAttachRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setBody((b) => `${b}${b ? "\n" : ""}📷 Attached: ${f.name}`);
                }
                e.target.value = "";
              }}
            />
            <div className="mt-3">
              <div className="text-xs text-[#888]">What&apos;s happening?</div>
              <div
                className="relative mt-1 rounded-[14px] border border-[#2a2a2a] bg-[#111]"
                style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, sans-serif" }}
              >
                <textarea
                  className="min-h-[140px] w-full resize-none rounded-[14px] bg-transparent px-3 pb-16 pt-3 pr-36 text-sm text-[#eeeeee] outline-none placeholder:text-[#555]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Job, shout-out, debate… drop it here."
                />
                <div className="absolute bottom-3 left-3 flex items-center gap-2 text-lg">
                  <button
                    type="button"
                    title="Photo"
                    className="rounded-lg p-1.5 text-[#888] transition hover:bg-white/5 hover:text-[#eeeeee]"
                    onClick={() => fileAttachRef.current?.click()}
                  >
                    📷
                  </button>
                  <button
                    type="button"
                    title="Location"
                    className="rounded-lg p-1.5 text-[#888] transition hover:bg-white/5 hover:text-[#eeeeee]"
                    onClick={() => attachLocationHint()}
                  >
                    📍
                  </button>
                  <button
                    type="button"
                    title="Tag"
                    className="rounded-lg p-1.5 text-[#888] transition hover:bg-white/5 hover:text-[#eeeeee]"
                    onClick={() => attachTag()}
                  >
                    🏷️
                  </button>
                </div>
                <button
                  type="button"
                  disabled={posting || droppedConfirm}
                  onClick={() => void handleDropIt()}
                  className="absolute bottom-3 right-3 min-h-[44px] rounded-[22px] px-4 py-2 text-sm font-bold transition enabled:active:scale-[0.98] disabled:opacity-50"
                  style={{
                    fontFamily: "var(--font-syne), ui-sans-serif, sans-serif",
                    background: droppedConfirm
                      ? "linear-gradient(180deg, #1a3d2a 0%, #0f2a18 100%)"
                      : "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
                    color: droppedConfirm ? "#3dff7a" : "#fff",
                    boxShadow: droppedConfirm ? "none" : "0 6px 18px rgba(255, 107, 0, 0.35)",
                  }}
                >
                  {droppedConfirm ? "✓ Dropped!" : posting ? "…" : "Drop It 🎯"}
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setComposerOpen(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {role === "driver" ? <DriverNav /> : <CustomerNav />}
    </main>
  );
}
