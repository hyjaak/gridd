"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { OWNER_NAME } from "@/lib/constants";

type Reviews = {
  googleRating?: number;
  googleReviewCount?: number;
  googleReviewUrl?: string;
};

const PROMISES = [
  "Flat price locked before we roll",
  "Text the second it's rolling",
  "Photo proof at drop-off",
  "Pay AFTER it's done — card, tap, or cash",
];

export default function TrustStrip() {
  const [reviews, setReviews] = useState<Reviews | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "systemConfig", "dispatchConfig"))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const d = snap.data();
          if (d.googleReviewCount && d.googleReviewCount > 0) {
            setReviews({
              googleRating: d.googleRating,
              googleReviewCount: d.googleReviewCount,
              googleReviewUrl: d.googleReviewUrl,
            });
          }
        }
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="my-5 space-y-4">
      {/* Owner row */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[#0e9f6e] flex items-center justify-center text-white text-[13px] font-bold flex-none mt-0.5">
          I
        </div>
        <p className="text-[13.5px] text-[#5c6a62] leading-relaxed">
          <strong className="text-[#101613]">{OWNER_NAME}</strong> — the owner. The
          person quoting your job is the person carrying it.
        </p>
      </div>

      {/* Promise checkmarks */}
      <ul className="space-y-2">
        {PROMISES.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[13.5px] text-[#5c6a62]">
            <span className="text-[#0e9f6e] font-bold flex-none mt-0.5">✓</span>
            {p}
          </li>
        ))}
      </ul>

      {/* Reviews — only render if real data exists */}
      {reviews && reviews.googleReviewCount && reviews.googleReviewCount > 0 && (
        <a
          href={reviews.googleReviewUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#0e9f6e] font-semibold no-underline hover:underline"
        >
          <span className="text-amber-500">★</span>{" "}
          {reviews.googleRating?.toFixed(1)} · {reviews.googleReviewCount} Dayton
          reviews
        </a>
      )}
    </div>
  );
}