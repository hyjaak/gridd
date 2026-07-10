"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireSignedIn } from "@/hooks/useRequireSignedIn";
import { useAuth } from "@/hooks/useAuth";
import type { PorchPost, PorchPostType } from "@/types";
import { CustomerNav } from "@/components/CustomerNav";
import { DriverNav } from "@/components/DriverNav";
import { NotificationBell } from "@/components/NotificationBell";
import { BackButton } from "@/components/BackButton";
import { DriverDemoChrome } from "@/components/driver/DriverDemoChrome";
import { PorchComposerModal } from "@/components/porch/PorchComposerModal";
import { PorchPostCard } from "@/components/porch/PorchPostCard";
import { PorchLeaderboard } from "@/components/porch/PorchLeaderboard";
import { toTimeMs } from "@/lib/porch-social";
import { haversineMiles } from "@/lib/geo-distance";
import { extractZipFromAddressLine, guessNeighborhoodCity } from "@/lib/address-zip";

const FILTERS: Array<{ id: "all" | PorchPostType; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "⭐ Reviews" },
  { id: "debate", label: "🗳️ Debates" },
  { id: "shoutout", label: "🏆 Shoutouts" },
  { id: "announcement", label: "📢 Announcements" },
];

const HOOD_TABS = [
  { id: "myhood" as const, label: "My Hood" },
  { id: "all" as const, label: "All GRIDD" },
  { id: "nearby" as const, label: "Nearby" },
];

export default function CustomerPorchPage() {
  const { loading: gateLoading, ok } = useRequireSignedIn();
  const { user, profile, role } = useAuth();
  const [posts, setPosts] = useState<PorchPost[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [hoodTab, setHoodTab] = useState<(typeof HOOD_TABS)[number]["id"]>("all");
  const [driversInZip, setDriversInZip] = useState(0);
  const [jobsNearby, setJobsNearby] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PorchPost | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [myReportPostIds, setMyReportPostIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

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

  useEffect(() => {
    if (!firebaseApp || !user?.uid) {
      setMyReportPostIds(new Set());
      return;
    }
    const q = query(collection(db, "reports"), where("reportedBy", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const s = new Set<string>();
        snap.docs.forEach((d) => {
          const pid = (d.data() as { postId?: string }).postId;
          if (pid) s.add(pid);
        });
        setMyReportPostIds(s);
      },
      () => setMyReportPostIds(new Set()),
    );
    return () => unsub();
  }, [user?.uid]);

  const userZip = useMemo(() => {
    const z = profile?.zip?.trim();
    if (z) return z;
    return extractZipFromAddressLine(profile?.homeAddress ?? "") ?? "";
  }, [profile?.zip, profile?.homeAddress]);

  const cityTitle = useMemo(
    () => guessNeighborhoodCity(profile?.homeAddress ?? "", userZip || null),
    [profile?.homeAddress, userZip],
  );

  const userGeo = profile?.homeAddressGeo;

  useEffect(() => {
    if (!firebaseApp || !userZip) {
      setDriversInZip(0);
      return;
    }
    const qy = query(collection(db, "providers"), where("zip", "==", userZip), limit(80));
    const unsub = onSnapshot(qy, (snap) => setDriversInZip(snap.size), () => setDriversInZip(0));
    return () => unsub();
  }, [userZip]);

  useEffect(() => {
    if (!firebaseApp || !userZip) {
      setJobsNearby(0);
      return;
    }
    const qy = query(
      collection(db, "jobs"),
      where("zip", "==", userZip),
      where("status", "==", "completed"),
      limit(120),
    );
    const unsub = onSnapshot(qy, (snap) => setJobsNearby(snap.size), () => setJobsNearby(0));
    return () => unsub();
  }, [userZip]);

  const todayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return posts.filter((p) => toTimeMs(p.createdAt) >= start.getTime()).length;
  }, [posts]);

  const postsInHood = useMemo(() => {
    if (!userZip) return 0;
    return posts.filter((p) => !p.hiddenFromFeed && (p.zipCode ?? "").trim() === userZip).length;
  }, [posts, userZip]);

  const neighborsInHood = useMemo(() => {
    if (!userZip) return 0;
    return new Set(
      posts
        .filter((p) => !p.hiddenFromFeed && (p.zipCode ?? "").trim() === userZip)
        .map((p) => p.authorUid),
    ).size;
  }, [posts, userZip]);

  const hoodContributorsWeek = useMemo(() => {
    if (!userZip) return [] as { name: string; count: number }[];
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const byUid = new Map<string, { name: string; count: number }>();
    for (const p of posts) {
      if ((p.zipCode ?? "").trim() !== userZip) continue;
      if (toTimeMs(p.createdAt) < start.getTime()) continue;
      const uid = p.authorUid;
      const name = p.authorName || "Member";
      byUid.set(uid, { name, count: (byUid.get(uid)?.count ?? 0) + 1 });
    }
    return [...byUid.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  }, [posts, userZip]);

  const visible = useMemo(() => {
    const typeFiltered = filter === "all" ? posts : posts.filter((p) => p.type === filter);
    const base = typeFiltered.filter((p) => {
      if (p.hiddenFromFeed) return false;
      if (p.deleted && role !== "ceo") return false;
      return true;
    });
    if (hoodTab === "all") return base;
    if (hoodTab === "myhood") {
      if (!userZip) return base;
      return base.filter((p) => (p.zipCode ?? "").trim() === userZip);
    }
    if (hoodTab === "nearby") {
      if (userGeo?.lat == null || userGeo?.lng == null) {
        if (!userZip) return base;
        return base.filter((p) => (p.zipCode ?? "").trim() === userZip);
      }
      const out: PorchPost[] = [];
      for (const p of base) {
        if (typeof p.lat === "number" && typeof p.lng === "number") {
          const d = haversineMiles(userGeo, { lat: p.lat, lng: p.lng });
          if (d <= 25) out.push({ ...p, distanceMiles: d });
        } else if (userZip && (p.zipCode ?? "").trim() === userZip) {
          out.push({ ...p, distanceMiles: 0 });
        }
      }
      return out.sort((a, b) => (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99));
    }
    return base;
  }, [posts, filter, role, hoodTab, userZip, userGeo]);

  const reporterName =
    profile?.name?.trim() || user?.displayName?.trim() || user?.email?.split("@")[0] || "Member";

  function openComposerNew() {
    setEditingPost(null);
    setComposerOpen(true);
  }

  if (gateLoading || !ok) {
    return <LoadingScreen />;
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
            <BackButton href="/home" inline className="mt-0.5" />
            <div className="min-w-0">
              <div className="text-lg font-semibold" style={{ color: "#D4A574" }}>
                {userZip ? `📍 ${userZip} — ${cityTitle ?? "Neighborhood"}` : "The Porch 🪑"}
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
          onClick={() => openComposerNew()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openComposerNew();
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
          <span style={{ color: "#555", fontSize: 13 }}>What&apos;s on your mind? Share with the neighborhood...</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {HOOD_TABS.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHoodTab(h.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                hoodTab === h.id
                  ? "border-[#00FF88] text-[#00FF88]"
                  : "border-[var(--border)] text-[var(--sub)]",
              ].join(" ")}
            >
              {h.label}
            </button>
          ))}
        </div>

        {hoodTab === "myhood" && userZip ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[#0a0a0a] px-4 py-3 text-xs leading-relaxed text-zinc-300">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Neighborhood pulse</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <span>
                👥 {neighborsInHood} neighbors on GRIDD · {postsInHood} hood posts
              </span>
              <span>🚛 {driversInZip} drivers in your area</span>
              <span>📦 {jobsNearby} jobs completed nearby</span>
            </div>
            {hoodContributorsWeek.length > 0 ? (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Top contributors this week</div>
                <ul className="space-y-1 text-zinc-200">
                  {hoodContributorsWeek.map((c, i) => (
                    <li key={`${c.name}_${i}`}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {c.name} — {c.count} posts
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

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
            <PorchPostCard
              key={p.id}
              post={p}
              user={user}
              profile={profile}
              role={role}
              alreadyReported={myReportPostIds.has(p.id)}
              reporterDisplayName={reporterName}
              onToast={setToast}
              onEditPost={(post) => {
                setEditingPost(post);
                setComposerOpen(true);
              }}
            />
          ))}
        </div>

        <PorchLeaderboard />
      </div>

      {!composerOpen ? (
        <button
          type="button"
          aria-label="New post"
          onClick={() => openComposerNew()}
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
