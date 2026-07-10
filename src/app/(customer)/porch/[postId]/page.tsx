"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db, firebaseApp } from "@/lib/firebase";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireSignedIn } from "@/hooks/useRequireSignedIn";
import { useAuth } from "@/hooks/useAuth";
import type { PorchPost } from "@/types";
import { CustomerNav } from "@/components/CustomerNav";
import { DriverNav } from "@/components/DriverNav";
import { NotificationBell } from "@/components/NotificationBell";
import { BackButton } from "@/components/BackButton";
import { DriverDemoChrome } from "@/components/driver/DriverDemoChrome";
import { PorchComposerModal } from "@/components/porch/PorchComposerModal";
import { PorchPostCard } from "@/components/porch/PorchPostCard";
export default function PorchSinglePostPage() {
  const params = useParams();
  const postId = typeof params.postId === "string" ? params.postId : "";
  const { loading: gateLoading, ok } = useRequireSignedIn();
  const { user, profile, role, isCEO } = useAuth();
  const [post, setPost] = useState<PorchPost | null | undefined>(undefined);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PorchPost | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [alreadyReported, setAlreadyReported] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!firebaseApp || !postId) {
      setPost(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "porch", postId),
      (snap) => {
        if (!snap.exists()) {
          setPost(null);
          return;
        }
        const data = snap.data() as Omit<PorchPost, "id">;
        setPost({ id: snap.id, ...data });
      },
      () => setPost(null),
    );
    return () => unsub();
  }, [postId]);

  useEffect(() => {
    if (!firebaseApp || !user?.uid || !postId) {
      setAlreadyReported(false);
      return;
    }
    const q = query(collection(db, "reports"), where("reportedBy", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const hit = snap.docs.some((d) => (d.data() as { postId?: string }).postId === postId);
        setAlreadyReported(hit);
      },
      () => setAlreadyReported(false),
    );
    return () => unsub();
  }, [user?.uid, postId]);

  const reporterName =
    profile?.name?.trim() || user?.displayName?.trim() || user?.email?.split("@")[0] || "Member";

  if (gateLoading || !ok) {
    return <LoadingScreen />;
  }

  if (post === undefined) {
    return (
      <main className="min-h-full bg-[#060606]">
        <div className="flex min-h-[40vh] items-center justify-center text-[var(--sub)]">Loading…</div>
      </main>
    );
  }

  if (post === null) {
    return (
      <main className="min-h-full bg-[#060606] px-6 py-10">
        <p className="text-[var(--text)]">Post not found.</p>
        <Link href="/porch" className="mt-4 inline-block text-[#00FF88] hover:underline">
          Back to The Porch
        </Link>
      </main>
    );
  }

  if (post.hiddenFromFeed && !isCEO) {
    return (
      <main className="min-h-full bg-[#060606]">
        {role === "driver" ? <DriverDemoChrome /> : null}
        {toast ? (
          <div
            className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-full border border-[var(--border)] bg-[#111] px-4 py-2 text-sm text-[var(--text)] shadow-lg"
            role="status"
          >
            {toast}
          </div>
        ) : null}
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-6 py-4">
            <BackButton href="/porch" inline className="mt-0.5" />
          </div>
        </header>
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="text-lg font-semibold text-zinc-200">Post hidden — under review</p>
          <p className="mt-2 text-sm text-[var(--sub)]">This post was flagged by the community. Check back later.</p>
          <Link href="/porch" className="mt-8 inline-block text-[#00FF88] hover:underline">
            Back to The Porch
          </Link>
        </div>
        {role === "driver" ? <DriverNav /> : <CustomerNav />}
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#060606]">
      {role === "driver" ? <DriverDemoChrome /> : null}
      {toast ? (
        <div
          className="fixed bottom-24 left-1/2 z-[200] max-w-sm -translate-x-1/2 whitespace-pre-line rounded-2xl border border-[var(--border)] bg-[#111] px-4 py-2 text-center text-sm text-[var(--text)] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#060606]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <BackButton href="/porch" inline className="mt-0.5" />
            <div className="min-w-0">
              <div className="text-lg font-semibold" style={{ color: "#D4A574" }}>
                Shared post
              </div>
              <div className="text-xs text-[var(--sub)]">gridd.click/porch/{postId}</div>
            </div>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 pb-36 pt-6">
        <PorchPostCard
          post={post}
          user={user}
          profile={profile}
          role={role}
          commentsDefaultOpen
          alreadyReported={alreadyReported}
          reporterDisplayName={reporterName}
          onToast={setToast}
          onEditPost={(p) => {
            setEditingPost(p);
            setComposerOpen(true);
          }}
        />
      </div>

      {composerOpen ? (
        <PorchComposerModal
          open={composerOpen}
          editingPost={editingPost}
          onClose={() => {
            setComposerOpen(false);
            setEditingPost(null);
          }}
          user={user}
          profile={profile}
          role={role}
        />
      ) : null}

      {role === "driver" ? <DriverNav /> : <CustomerNav />}
    </main>
  );
}
