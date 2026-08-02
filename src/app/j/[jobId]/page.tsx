"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PHONE, PHONE_HREF } from "@/lib/constants";
import RunHero, { statusToStage } from "@/components/job/RunHero";
import QuotedPanel from "@/components/job/QuotedPanel";
import { TipRow, RatingRow, AfterParty } from "@/components/job/RunPanel";
import type { DispatchJob } from "@/types/dispatch";

function fmtTime(ts: any): string {
  if (!ts) return "";
  const t = ts.seconds ? ts.seconds * 1000 : (ts.toMillis?.() ?? 0);
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function JobPage({ params }: { params: { jobId: string } }) {
  const [job, setJob] = useState<DispatchJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerSending, setOfferSending] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [tip, setTip] = useState<number | undefined>(undefined);
  const [rating, setRating] = useState<number | undefined>(undefined);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "dispatchJobs", params.jobId), (snap) => {
      if (!snap.exists()) { setError("Job not found"); setLoading(false); return; }
      const j = { id: snap.id, ...snap.data() } as DispatchJob;
      setJob(j);
      setTip(j.tipAmount);
      setRating(j.rating);
      setLoading(false);
    }, () => {
      setError("Unable to load job — check the link or text us.");
      setLoading(false);
    });
    return unsub;
  }, [params.jobId]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch("/api/accept-job", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: params.jobId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to accept");
      setAccepted(true);
      setConfetti(true);
      setTimeout(() => setConfetti(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setAccepting(false);
    }
  };

  const handleOffer = async () => {
    const amt = Number(offerAmount);
    if (isNaN(amt) || amt < 20 || amt > 500) { setError("Offer must be $20–$500"); return; }
    setOfferSending(true);
    setError(null);
    try {
      const res = await fetch("/api/counter-offer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: params.jobId, amount: amt }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setOfferSent(true);
      setOfferAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send offer");
    } finally {
      setOfferSending(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#eef3ef] flex items-center justify-center">
      <div className="text-[#5c6a62] text-[15px] font-semibold animate-pulse">Loading job…</div>
    </div>
  );

  if (error || !job) return (
    <div className="min-h-screen bg-[#eef3ef] flex flex-col items-center justify-center px-6 text-center">
      <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[48px] text-[#0e9f6e] mb-4">gridd</div>
      <p className="text-[#5c6a62] text-[15px] mb-4">{error || "Job not found"}</p>
      <a href={PHONE_HREF} className="text-[#0e9f6e] font-bold no-underline text-[14px]">Text or call {PHONE}</a>
    </div>
  );

  const s = job.status;
  const idShort = params.jobId.slice(0, 6);
  const isDone = ["paid", "declined", "cancelled"].includes(s);
  const stage = statusToStage(s);
  const showHero = ["accepted", "assigned", "pickup", "in_progress", "proof", "paid"].includes(s);
  const base = job.agreedAmount ?? job.quoteAmount ?? 0;
  const total = base + (tip ?? 0);

  return (
    <main className="min-h-screen bg-[#eef3ef] font-['Inter',sans-serif] text-[#101613]">
      <header className="bg-white border-b border-[rgba(16,22,19,0.09)] px-[5vw] py-3 flex items-center justify-between">
        <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[20px] text-[#0e9f6e]">gridd</div>
        <div className="flex items-center gap-3 text-[12px] font-bold text-[#5c6a62]">
          <span>JOB #{idShort}</span>
          <a href={PHONE_HREF} className="text-[#0e9f6e] no-underline">Call</a>
          <a href={`sms:${PHONE}`} className="text-[#0e9f6e] no-underline">Text</a>
        </div>
      </header>

      {confetti && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center text-[60px]">🎉</div>
      )}

      <div className="max-w-lg mx-auto px-[5vw] py-8">
        {showHero && <RunHero job={job} stage={stage} />}

        {s === "request" && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#d9a441] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">⏳</div>
            <h1 className="text-[28px] font-[800] font-bricolage mb-2">We're pricing your run</h1>
            <p className="text-[15px] text-[#5c6a62] leading-relaxed mb-6">A flat number appears right here, usually within the hour.</p>
            <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-5 text-left">
              <div className="font-extrabold text-[14px] mb-2">{job.contactName || "Your run"}</div>
              <div className="text-[13px] text-[#5c6a62] font-semibold">{job.jobType} · {job.pickupAddress?.city} → {job.dropoffAddress?.city}</div>
              <p className="text-[13px] text-[#5c6a62] mt-2">{job.description}</p>
            </div>
            <div className="mt-6 text-left bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-5">
              <div className="text-[13px] font-bold text-[#101613] mb-3">Who shows up</div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0e9f6e] to-[#0a7a54] flex items-center justify-center text-white text-[18px] font-extrabold">I</div>
                <div><div className="font-extrabold text-[14px]">Ibrahim — owner, operator</div><div className="text-[12px] text-[#5c6a62]">The person who prices it is the person who shows up.</div></div>
              </div>
              <div className="space-y-2 text-[13px] text-[#5c6a62]">
                {["Flat price locked — not an estimate", "Pay after it's done — card, tap, or cash", "Photo proof sent to your phone", "Refresh-free live updates"].map((p, i) => (
                  <div key={i} className="flex items-center gap-2"><span className="text-[#0e9f6e] font-bold">✓</span>{p}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {s === "quoted" && (
          <QuotedPanel job={job} accepting={accepting} accepted={accepted}
            offerAmount={offerAmount} offerSending={offerSending} offerSent={offerSent}
            onAccept={handleAccept} onOfferChange={setOfferAmount}
            onSendOffer={handleOffer} onShowOfferInput={() => setOfferSent(false)} />
        )}

        {["accepted", "assigned", "pickup"].includes(s) && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">✓</div>
            <h1 className="text-[28px] font-[800] font-bricolage mb-2">Booked ✓</h1>
            <p className="text-[15px] text-[#5c6a62] mb-6">We'll roll soon — watch your phone for updates.</p>
            <div className="flex items-center gap-1 justify-center mb-4">
              {["Quoted", "Booked", "Rolling", "Photo", "Paid"].map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold ${i <= 1 ? "bg-[#0e9f6e] text-white" : "bg-[#d9d9d9] text-[#5c6a62]"}`}>{i === 0 ? "$" : i + 1}</div>
                  {i < 4 && <div className="w-4 h-0.5 bg-[#d9d9d9]" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {s === "in_progress" && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">🚚</div>
            <h1 className="text-[28px] font-[800] font-bricolage mb-2">On the move 🚚</h1>
            <p className="text-[15px] text-[#5c6a62] mb-6">Your run is rolling — we'll send a photo when it's delivered.</p>
            <div className="flex items-center gap-1 justify-center mb-4">
              {["Quoted", "Booked", "Rolling", "Photo", "Paid"].map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold ${i <= 2 ? "bg-[#0e9f6e] text-white" : "bg-[#d9d9d9] text-[#5c6a62]"}`}>{i === 0 ? "$" : i + 1}</div>
                  {i < 4 && <div className="w-4 h-0.5 bg-[#d9d9d9]" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {s === "proof" && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">📸</div>
            <h1 className="text-[28px] font-[800] font-bricolage mb-2">Delivered.</h1>
            {job.proofPhotoUrl && (
              <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-3 mb-4 shadow-lg inline-block">
                <img src={job.proofPhotoUrl} alt="Proof of delivery" className="w-48 h-48 object-cover rounded-xl" />
              </div>
            )}
            <p className="text-[15px] text-[#5c6a62] mb-6">Pay Ibrahim on the spot — card, tap, or cash.</p>
            {tip != null && tip > 0 && (
              <div className="text-[14px] font-extrabold text-[#0e9f6e] mb-4">Total today: ${base.toFixed(2)} + ${tip} tip = ${total.toFixed(2)}</div>
            )}
            <div className="mb-4"><TipRow job={job} onTip={setTip} /></div>
            <div className="flex items-center gap-1 justify-center mb-4">
              {["Quoted", "Booked", "Rolling", "Photo", "Paid"].map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold ${i <= 3 ? "bg-[#0e9f6e] text-white" : "bg-[#d9d9d9] text-[#5c6a62]"}`}>{i === 0 ? "$" : i + 1}</div>
                  {i < 4 && <div className="w-4 h-0.5 bg-[#d9d9d9]" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {s === "paid" && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#0e9f6e] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">✓</div>
            <h1 className="text-[28px] font-[800] font-bricolage mb-2">Receipt</h1>
            <div className="bg-white border border-[rgba(16,22,19,0.09)] rounded-2xl p-6 mb-4 shadow-lg">
              <div className="font-['Bricolage_Grotesque',sans-serif] font-extrabold text-[42px] text-[#0e9f6e]">
                {tip != null && tip > 0 ? `$${base.toFixed(2)} + $${tip} tip 💚` : `$${base.toFixed(2)}`}
              </div>
              <div className="text-[13px] text-[#5c6a62] font-semibold mt-1">{fmtTime(job.paidAt)}</div>
              {job.paymentMethod === "cash" && <div className="text-[12px] font-extrabold text-[#d9a441] mt-1">Paid cash</div>}
              {job.proofPhotoUrl && (
                <div className="mt-3"><img src={job.proofPhotoUrl} alt="Proof of delivery" className="w-32 h-32 object-cover rounded-xl mx-auto border border-[rgba(16,22,19,0.09)]" /></div>
              )}
            </div>
            <p className="text-[13px] text-[#5c6a62] mb-4">Saved here forever.</p>
            {tip == null || tip === 0 ? (
              <div className="mb-4"><TipRow job={job} onTip={setTip} /></div>
            ) : (
              <div className="text-[12px] text-[#5c6a62] font-semibold mb-4">Tip added — thank you 💚</div>
            )}
            <div className="space-y-3 mb-4"><RatingRow job={job} onRated={setRating} /></div>
            <AfterParty job={job} />
            <div className="flex items-center gap-1 justify-center mt-4">
              {["Quoted", "Booked", "Rolling", "Photo", "Paid"].map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <div className="w-7 h-7 rounded-full bg-[#0e9f6e] text-white flex items-center justify-center text-[11px] font-extrabold">{i === 0 ? "$" : i + 1}</div>
                  {i < 4 && <div className="w-4 h-0.5 bg-[#0e9f6e]" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {isDone && s !== "paid" && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#5c6a62] text-white text-[26px] font-extrabold flex items-center justify-center mx-auto mb-4">—</div>
            <h1 className="text-[28px] font-[800] font-bricolage mb-2">This run was closed</h1>
            <p className="text-[15px] text-[#5c6a62] mb-6">Text us to rebook.</p>
            <a href={PHONE_HREF} className="inline-block bg-[#0e9f6e] text-white font-bold text-[16px] px-8 py-3 rounded-full hover:bg-[#0a7a54] transition-colors no-underline">{PHONE}</a>
          </div>
        )}
      </div>
    </main>
  );
}