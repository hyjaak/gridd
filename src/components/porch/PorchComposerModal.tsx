"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db, firebaseApp, firebaseAuth } from "@/lib/firebase";
import { extractZipFromAddressLine, guessNeighborhoodCity } from "@/lib/address-zip";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AddressInput } from "@/components/AddressInput";
import type { PorchPost, PorchPostType, UserRole } from "@/types";
import type { User } from "firebase/auth";
import type { GriddProfile } from "@/providers/AuthProvider";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";

type Props = {
  open: boolean;
  editingPost: PorchPost | null;
  onClose: () => void;
  user: User | null;
  profile: GriddProfile | null;
  role: UserRole | null;
  onFinished?: () => void;
};

export function PorchComposerModal({
  open,
  editingPost,
  onClose,
  user,
  profile,
  role,
  onFinished,
}: Props) {
  const isEdit = Boolean(editingPost);
  const [postType, setPostType] = useState<PorchPostType>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState("");
  const [posting, setPosting] = useState(false);
  const [droppedConfirm, setDroppedConfirm] = useState(false);
  const [jobLocation, setJobLocation] = useState("");
  const fileAttachRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editingPost) {
      setPostType(editingPost.type);
      setTitle(editingPost.title ?? "");
      setBody(editingPost.body ?? "");
      setRating(typeof editingPost.rating === "number" ? editingPost.rating : 5);
      setCategory(editingPost.category ?? editingPost.type ?? "general");
      setJobLocation(editingPost.jobLocation ?? "");
    } else {
      setPostType("post");
      setTitle("");
      setBody("");
      setRating(5);
      setCategory("general");
      setJobLocation("");
    }
  }, [open, editingPost]);

  if (!open) return null;

  async function persistNew(): Promise<boolean> {
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
        role === "ceo" ? "ceo" : role === "driver" ? "driver" : "customer";

      const loc = jobLocation.trim() || null;

      const zipRaw =
        (pdata?.zip as string | undefined)?.trim() ||
        profile?.zip?.trim() ||
        extractZipFromAddressLine(
          ((pdata?.homeAddress as string | undefined) ?? profile?.homeAddress) ?? "",
        );
      const geoHome =
        (pdata?.homeAddressGeo as { lat: number; lng: number } | undefined) ||
        (pdata?.homeAddressCoords as { lat: number; lng: number } | undefined) ||
        profile?.homeAddressGeo;
      const gridd =
        typeof (pdata as { griddScore?: number })?.griddScore === "number"
          ? (pdata as { griddScore: number }).griddScore
          : typeof profile?.griddScore === "number"
            ? profile.griddScore
            : 0;

      const cat =
        category.trim() ||
        (postType === "post" ? "general" : postType);

      const payload = {
        title: title?.trim() || effectiveTitle || "",
        body: body?.trim() || bodyText || "",
        type: postType,
        category: cat,
        votes: { yes: 0, no: 0 },
        voteCount: 0,
        upvotes: [] as string[],
        downvotes: [] as string[],
        comments: [] as unknown[],
        commentCount: 0,
        tags: [] as string[],
        imageUrl: null as null,
        location: loc,
        jobLocation: loc,
        authorUid: user.uid,
        authorId: user.uid,
        userId: user.uid,
        authorName: String(
          (authorName ?? user.displayName ?? profile?.name ?? user.email ?? "Anonymous") || "Anonymous",
        ),
        authorPhoto: user.photoURL ?? null,
        authorRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: "active" as const,
        pinned: false,
        reported: false,
        likeUids: [] as string[],
        likes: [] as string[],
        griddit: [] as string[],
        likeCount: 0,
        gridditCount: 0,
        edited: false,
        zipCode: zipRaw || null,
        neighborhood: guessNeighborhoodCity(
          ((pdata?.homeAddress as string | undefined) ?? profile?.homeAddress) ?? "",
          zipRaw || null,
        ),
        lat: typeof geoHome?.lat === "number" ? geoHome.lat : null,
        lng: typeof geoHome?.lng === "number" ? geoHome.lng : null,
        authorGriddScore: gridd,
        ...(postType === "review" ? { rating: Number(rating) || 5 } : {}),
      };

      const docRef = await addDoc(
        collection(db, "porch"),
        sanitizeForFirestore(payload as Record<string, unknown>),
      );
      try {
        const token = await firebaseAuth?.currentUser?.getIdToken();
        if (token) {
          await fetch("/api/gridd-score", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "porch_post", postId: docRef.id }),
          });
        }
      } catch {
        /* score bump optional */
      }
      return true;
    } catch (err: unknown) {
      console.error("Post failed:", err);
      alert(err instanceof Error ? `Could not post: ${err.message}` : "Could not post.");
      return false;
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(): Promise<boolean> {
    if (!editingPost || !firebaseApp || !user) return false;
    const bodyText = body.trim();
    if (!bodyText) {
      alert("Write something first.");
      return false;
    }
    const effectiveTitle =
      title.trim() || bodyText.slice(0, 80).replace(/\s+/g, " ").trim() || "Post";
    const loc = jobLocation.trim() || null;
    const cat = category.trim() || editingPost.category || editingPost.type;

    setPosting(true);
    try {
      const ref = doc(db, "porch", editingPost.id);
      await updateDoc(ref, {
        title: title?.trim() || effectiveTitle,
        body: bodyText,
        category: cat,
        jobLocation: loc,
        location: loc,
        updatedAt: serverTimestamp(),
        edited: true,
        ...(editingPost.type === "review" ? { rating: Number(rating) || 5 } : {}),
      });
      return true;
    } catch (err: unknown) {
      console.error("Update failed:", err);
      alert(err instanceof Error ? `Could not update: ${err.message}` : "Could not update.");
      return false;
    } finally {
      setPosting(false);
    }
  }

  async function handlePrimary() {
    if (posting) return;
    if (isEdit) {
      const ok = await saveEdit();
      if (!ok) return;
      onFinished?.();
      onClose();
      return;
    }
    const ok = await persistNew();
    if (!ok) return;
    setDroppedConfirm(true);
    window.setTimeout(() => {
      setDroppedConfirm(false);
      onFinished?.();
      onClose();
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
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
        if (!key) {
          setBody((b) => `${b}${b ? "\n" : ""}📍 Location: (add Google Maps key in .env)`);
          return;
        }
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${encodeURIComponent(key)}`,
          );
          const data = (await res.json()) as {
            results?: Array<{ formatted_address?: string }>;
          };
          const line = data.results?.[0]?.formatted_address;
          if (line) {
            setBody((b) => `${b}${b ? "\n" : ""}📍 ${line}`);
          } else {
            setBody((b) => `${b}${b ? "\n" : ""}📍 Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch {
          setBody((b) => `${b}${b ? "\n" : ""}📍 Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
      },
      () => {
        setBody((b) => `${b}${b ? "\n" : ""}📍 Location: unavailable — add details in text`);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-[var(--text)]">
            {isEdit ? "Edit post" : "New post"}
          </div>
          <button type="button" className="text-[var(--sub)]" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["post", "review", "debate", "shoutout"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={isEdit}
              onClick={() => !isEdit && setPostType(t)}
              className={[
                "rounded-full border px-3 py-1 text-xs capitalize",
                isEdit ? "cursor-not-allowed opacity-60" : "",
                postType === t ? "border-[#D4A574] text-[#D4A574]" : "border-[var(--border)] text-[var(--sub)]",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>
        {isEdit ? (
          <p className="mt-2 text-[10px] text-[var(--sub)]">Post type can&apos;t be changed.</p>
        ) : null}
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
        <div className="mt-4">
          <div className="text-xs text-[var(--sub)]">Category</div>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. general, neighborhood"
          />
        </div>
        <div className="mt-4">
          <div className="text-xs text-[var(--sub)]">Job / meetup location (optional)</div>
          <div className="mt-1">
            <AddressInput
              value={jobLocation}
              onChange={setJobLocation}
              placeholder="Search for an address…"
              showCurrentLocationButton
            />
          </div>
        </div>
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
                onClick={() => void attachLocationHint()}
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
            {!isEdit ? (
              <button
                type="button"
                disabled={posting || droppedConfirm}
                onClick={() => void handlePrimary()}
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
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {isEdit ? (
            <Button
              onClick={() => void handlePrimary()}
              disabled={posting}
              className="min-h-[44px] font-bold"
              style={{
                background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
                color: "#fff",
              }}
            >
              {posting ? "…" : "Update Post"}
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
