import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";
import { buildPostContentSnapshot, PORCH_REPORT_REASONS } from "@/lib/porch-reports";
import type { PorchPost } from "@/types";

const GRIDD_ORANGE = "#ff6b00";
const REPORT_REASON_IDS = new Set<string>(PORCH_REPORT_REASONS.map((r) => r.id));

export { GRIDD_ORANGE };

export function toTimeMs(iso: unknown): number {
  if (iso && typeof iso === "object" && "toDate" in iso && typeof (iso as { toDate: () => Date }).toDate === "function") {
    return (iso as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof iso === "string") {
    return new Date(iso).getTime();
  }
  return NaN;
}

/** Feed timestamps: just now / Nm ago / Nh ago / Nd ago / Jan 15 */
export function formatPorchTime(iso: unknown): string {
  const t = toTimeMs(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const dt = new Date(t);
  const now = new Date();
  const sameYear = dt.getFullYear() === now.getFullYear();
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function porchLikeUids(post: PorchPost): string[] {
  const p = post as unknown as { likes?: unknown; likeUids?: unknown };
  if (Array.isArray(p.likes)) return [...(p.likes as string[])];
  if (typeof p.likes === "number" && Array.isArray(p.likeUids)) return [...(p.likeUids as string[])];
  if (Array.isArray(p.likeUids)) return [...(p.likeUids as string[])];
  return [];
}

export function porchGridditUids(post: PorchPost): string[] {
  const raw = post.griddit;
  return Array.isArray(raw) ? [...raw] : [];
}

export function porchLikeCount(post: PorchPost): number {
  if (typeof post.likeCount === "number") return post.likeCount;
  return porchLikeUids(post).length;
}

export function porchGridditCount(post: PorchPost): number {
  if (typeof post.gridditCount === "number") return post.gridditCount;
  return porchGridditUids(post).length;
}

export function shareablePorchUrl(postId: string): string {
  const base =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SHARE_BASE_URL?.replace(/\/$/, "")) ||
    "https://gridd.click";
  return `${base}/porch/${postId}`;
}

function readLikeUids(data: Record<string, unknown> | undefined): string[] {
  if (!data) return [];
  if (Array.isArray(data.likes)) return [...(data.likes as string[])];
  if (typeof data.likes === "number" && Array.isArray(data.likeUids)) return [...(data.likeUids as string[])];
  if (Array.isArray(data.likeUids)) return [...(data.likeUids as string[])];
  return [];
}

export async function togglePorchLike(postId: string, uid: string): Promise<void> {
  const postRef = doc(db, "porch", postId);
  const postSnap = await getDoc(postRef);
  const likes = readLikeUids(postSnap.data() as Record<string, unknown> | undefined);
  if (likes.includes(uid)) {
    await updateDoc(postRef, {
      likes: arrayRemove(uid),
      likeUids: arrayRemove(uid),
      likeCount: increment(-1),
    });
  } else {
    await updateDoc(postRef, {
      likes: arrayUnion(uid),
      likeUids: arrayUnion(uid),
      likeCount: increment(1),
    });
  }
}

export async function toggleCommentLike(postId: string, commentId: string, uid: string): Promise<void> {
  const ref = doc(db, "porch", postId, "comments", commentId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    const arr = Array.isArray(data?.likes) ? [...(data.likes as string[])] : [];
    const i = arr.indexOf(uid);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(uid);
    tx.update(ref, { likes: arr, likeCount: arr.length });
  });
}

export async function togglePorchGriddit(postId: string, uid: string): Promise<void> {
  const postRef = doc(db, "porch", postId);
  const postSnap = await getDoc(postRef);
  const raw = postSnap.data()?.griddit;
  const griddit = Array.isArray(raw) ? [...(raw as string[])] : [];
  if (griddit.includes(uid)) {
    await updateDoc(postRef, {
      griddit: arrayRemove(uid),
      gridditCount: increment(-1),
    });
  } else {
    await updateDoc(postRef, {
      griddit: arrayUnion(uid),
      gridditCount: increment(1),
    });
  }
}

export async function addPorchComment(
  postId: string,
  payload: {
    authorId: string;
    authorName: string;
    authorPhoto: string | null;
    text: string;
    parentCommentId: string | null;
  },
): Promise<void> {
  await addDoc(
    collection(db, "porch", postId, "comments"),
    sanitizeForFirestore({
      ...payload,
      createdAt: serverTimestamp(),
      likes: [] as string[],
      likeCount: 0,
      deleted: false,
    }),
  );
  await updateDoc(doc(db, "porch", postId), {
    commentCount: increment(1),
  });
}

export async function deletePorchComment(postId: string, commentId: string): Promise<void> {
  const repliesSnap = await getDocs(
    query(collection(db, "porch", postId, "comments"), where("parentCommentId", "==", commentId)),
  );
  const batch = writeBatch(db);
  let removed = 1;
  repliesSnap.forEach((d) => {
    batch.delete(d.ref);
    removed += 1;
  });
  batch.delete(doc(db, "porch", postId, "comments", commentId));
  batch.update(doc(db, "porch", postId), {
    commentCount: increment(-removed),
  });
  await batch.commit();
}

/** User-initiated delete: marks post deleted; content retained for review (CEO still sees). */
export async function softDeletePorchPost(postId: string, deletedByUid: string): Promise<void> {
  await updateDoc(doc(db, "porch", postId), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedByUid,
    status: "deleted",
  });
}

/** Client-side report (replaces /api/porch/report). */
export async function submitPorchReportClient(
  post: PorchPost,
  reason: string,
  details: string,
  reporterUid: string,
  reporterName: string,
): Promise<void> {
  const postId = post.id;
  if (!REPORT_REASON_IDS.has(reason)) throw new Error("Invalid request");
  const reportId = `${reporterUid}_${postId}`;
  const reportRef = doc(db, "reports", reportId);
  const postRef = doc(db, "porch", postId);

  await runTransaction(db, async (tx) => {
    const postSnap = await tx.get(postRef);
    const reportSnap = await tx.get(reportRef);
    if (!postSnap.exists()) throw new Error("not_found");
    if (reportSnap.exists()) throw new Error("already_reported");
    const postData = postSnap.data() as {
      authorUid?: string;
      title?: string;
      body?: string;
      reportCount?: number;
    };
    // Support both authorUid and authorId on legacy posts
    const authorUid = postData.authorUid ?? (postSnap.data() as { authorId?: string }).authorId;
    if (authorUid === reporterUid) throw new Error("own_post");
    const prevCount = typeof postData.reportCount === "number" ? postData.reportCount : 0;
    const newCount = prevCount + 1;
    const postContent = buildPostContentSnapshot({
      title: postData.title ?? post.title ?? "",
      body: postData.body ?? post.body ?? "",
    });

    tx.set(
      reportRef,
      sanitizeForFirestore({
        postId,
        reportedUserId: authorUid ?? "",
        reportedBy: reporterUid,
        reporterName,
        reason,
        details: details.slice(0, 4000),
        createdAt: serverTimestamp(),
        status: "pending",
        postContent,
        type: "porch_post",
      }),
    );

    tx.update(postRef, {
      reportCount: newCount,
      hiddenFromFeed: newCount >= 3,
      ...(newCount >= 3
        ? {
            status: "under_review",
            hidden: true,
          }
        : {}),
    });
  });
}

export async function deletePorchPostCascade(postId: string): Promise<void> {
  const refs: DocumentReference[] = [];
  const commentsSnap = await getDocs(collection(db, "porch", postId, "comments"));
  commentsSnap.forEach((d) => refs.push(d.ref));
  const votesSnap = await getDocs(collection(db, "porch", postId, "votes"));
  votesSnap.forEach((d) => refs.push(d.ref));
  refs.push(doc(db, "porch", postId));

  const chunk = 500;
  for (let i = 0; i < refs.length; i += chunk) {
    const batch = writeBatch(db);
    for (const r of refs.slice(i, i + chunk)) {
      batch.delete(r);
    }
    await batch.commit();
  }
}
