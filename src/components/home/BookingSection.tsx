"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MARKETS, PHONE, PHONE_HREF } from "@/lib/constants";
import type { MarketKey, ServiceId } from "@/lib/constants";

const SVC_CARDS: { id: ServiceId; label: string; blurb: string; from: number }[] = [
  { id: "delivery", label: "Delivery", blurb: "Marketplace & store pickups", from: 45 },
  { id: "errand", label: "Errands", blurb: "Runs, drops, wait-in-line", from: 45 },
  { id: "hauling", label: "Light hauling", blurb: "One-van loads, gone today", from: 75 },
];

type Props = {
  market: MarketKey;
};

export default function BookingSection({ market }: Props) {
  const [svc, setSvc] = useState<ServiceId>("delivery");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [phone, setPhone] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      setError("Please enter a valid phone number");
      return;
    }
    const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "dispatchJobs"), {
        jobType: svc,
        pickupCity: pickup.trim(),
        dropoffCity: dropoff.trim(),
        customerPhone: normalized,
        description: desc.trim(),
        status: "request",
        source: "form",
        market: MARKETS[market].code,
        assignedTo: "owner",
        payoutPct: 0,
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch {
      setError(
        `Something went wrong. Try texting us at ${PHONE} or call.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-5">
        <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">
          ✓
        </div>
        <h3 className="text-[28px] font-[800] font-bricolage tracking-tight leading-tight mb-1.5 text-[#101613]">
          Got it.
        </h3>
        <p className="text-[15px] text-[#5c6a62]">
          You'll have a flat price within the hour — watch your texts.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[9px] my-[18px]">
        {SVC_CARDS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSvc(s.id)}
            className={`border-2 rounded-2xl p-3.5 text-left font-inherit cursor-pointer flex flex-col gap-[3px] transition-colors ${
              svc === s.id
                ? "border-[#0e9f6e] bg-[#f2faf6] shadow-[0_8px_20px_rgba(14,159,110,.14)]"
                : "border-black/12 bg-white"
            }`}
          >
            <b className="text-[14.5px]">{s.label}</b>
            <span className="text-[11.5px] text-[#5c6a62]">{s.blurb}</span>
            <em className="not-italic text-[12.5px] font-extrabold text-[#0e9f6e] mt-[3px]">
              from ${s.from}
            </em>
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex gap-2">
          <input
            type="text"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="Pickup city"
            className="flex-1 border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
          />
          <input
            type="text"
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            placeholder="Drop-off city"
            className="flex-1 border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
          />
        </div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone"
          className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 focus:outline-none focus:border-[#0e9f6e]"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="The job — what, from where, to where?"
          rows={2}
          className="border-[1.5px] border-black/14 rounded-xl px-3 py-3 text-[14.5px] bg-white mb-2 resize-vertical min-h-[70px] focus:outline-none focus:border-[#0e9f6e]"
        />
        {error && <p className="text-[13px] text-red-500 mb-2">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#0e9f6e] text-white font-bold text-[16px] py-3.5 rounded-full mt-1 shadow-[0_12px_26px_rgba(14,159,110,.32)] hover:bg-[#0a7a54] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none text-center"
        >
          {submitting ? "Sending..." : "Get my flat price"}
        </button>
        <div className="text-center mt-3 text-[13px] text-[#5c6a62]">
          or call / text{" "}
          <a href={PHONE_HREF} className="text-[#0e9f6e] font-extrabold no-underline">
            {PHONE}
          </a>
        </div>
      </form>
    </div>
  );
}