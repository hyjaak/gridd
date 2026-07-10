import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  try {
    const [nu, pd, porchSnap, featSnap] = await Promise.all([
      adminDb.collection("users").orderBy("griddScore", "desc").limit(15).get().catch(() => null),
      adminDb
        .collection("providers")
        .orderBy("completedJobCount", "desc")
        .limit(15)
        .get()
        .catch(() => null),
      adminDb.collection("porch").orderBy("gridditCount", "desc").limit(30).get().catch(() => null),
      adminDb.collection("community").doc("featured").get().catch(() => null),
    ]);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const neighbors =
      nu?.docs.map((d) => {
        const x = d.data() as { name?: string; griddScore?: number; griddTier?: string };
        return {
          uid: d.id,
          name: x.name ?? "Neighbor",
          griddScore: typeof x.griddScore === "number" ? x.griddScore : 0,
          griddTier: x.griddTier ?? "",
        };
      }) ?? [];

    const drivers =
      pd?.docs.map((d) => {
        const x = d.data() as {
          name?: string;
          rating?: number;
          completedJobCount?: number;
          griddScore?: number;
          griddTier?: string;
        };
        return {
          uid: d.id,
          name: x.name ?? "Driver",
          rating: typeof x.rating === "number" ? x.rating : 0,
          jobs: typeof x.completedJobCount === "number" ? x.completedJobCount : 0,
          griddScore: typeof x.griddScore === "number" ? x.griddScore : 0,
          griddTier: x.griddTier ?? "",
        };
      }) ?? [];

    const gridditThisWeek =
      porchSnap?.docs
        .map((d) => {
          const x = d.data() as {
            title?: string;
            authorName?: string;
            gridditCount?: number;
            createdAt?: unknown;
          };
          let createdMs = 0;
          const ct = x.createdAt;
          if (ct && typeof ct === "object" && "toDate" in ct && typeof (ct as { toDate: () => Date }).toDate === "function") {
            createdMs = (ct as { toDate: () => Date }).toDate().getTime();
          } else if (typeof ct === "string") {
            createdMs = new Date(ct).getTime();
          }
          return {
            id: d.id,
            title: x.title ?? "Post",
            authorName: x.authorName ?? "",
            gridditCount: typeof x.gridditCount === "number" ? x.gridditCount : 0,
            createdMs,
          };
        })
        .filter((r) => r.createdMs >= weekStart.getTime())
        .slice(0, 15) ?? [];

    const featured = featSnap?.exists
      ? (featSnap.data() as { neighborUid?: string; label?: string })
      : null;

    return NextResponse.json({
      ok: true,
      neighbors,
      drivers,
      gridditThisWeek,
      featured: featured?.neighborUid
        ? { uid: featured.neighborUid, label: featured.label ?? "Featured" }
        : null,
    });
  } catch (e) {
    console.error("[leaderboard]", e);
    return NextResponse.json({ ok: false, error: "Leaderboard failed" }, { status: 500 });
  }
}
