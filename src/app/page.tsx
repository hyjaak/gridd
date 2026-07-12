"use client";

import { useState, useCallback } from "react";
import type { MarketKey } from "@/lib/constants";
import { MARKETS, PHONE, PHONE_HREF } from "@/lib/constants";
import Scene3D from "@/components/home/Scene3D";
import TopBar from "@/components/home/TopBar";
import UtilityBar from "@/components/home/UtilityBar";
import RouteRail from "@/components/home/RouteRail";
import ScrollSection from "@/components/home/ScrollSection";
import LiveChip from "@/components/home/LiveChip";
import DeliveredCard from "@/components/home/DeliveredCard";
import Flash from "@/components/home/Flash";
import BookingSection from "@/components/home/BookingSection";
import FAQSection from "@/components/home/FAQSection";
import { fireConfetti } from "@/components/home/confetti";

export default function HomePage() {
  const [market, setMarket] = useState<MarketKey>("OH");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [flashTrigger, setFlashTrigger] = useState(0);

  const handlePhoto = useCallback((dataUrl: string) => {
    setPhotoUrl(dataUrl);
    setFlashTrigger((n) => n + 1);
  }, []);

  const handleDelivered = useCallback((d: boolean) => {
    setDelivered(d);
    if (d) {
      fireConfetti();
    }
  }, []);

  const m = MARKETS[market];

  return (
    <div className="bg-[#eef3ef] text-[#101613] font-inter">
      <Scene3D
        market={market}
        onPhoto={handlePhoto}
        onDelivered={handleDelivered}
      />

      {/* Vignette */}
      <div className="fixed inset-0 z-5 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_62%,rgba(16,22,19,.10)_100%)]" />

      <UtilityBar market={market} />
      <TopBar market={market} onMarketChange={setMarket} />
      <RouteRail />
      <LiveChip market={market} />
      <Flash trigger={flashTrigger} />
      <DeliveredCard show={delivered} photoUrl={photoUrl} />

      <main className="relative z-10">
        {/* Hero */}
        <ScrollSection id="hero">
          <div className="stop">Pickup · {m.label}</div>
          <h1 className="text-[clamp(40px,6vw,74px)] font-[800] font-bricolage tracking-tight leading-tight mb-4">
            One run.<br />Start to done.
          </h1>
          <p className="text-[16.5px] leading-relaxed text-[#5c6a62]">
            <span>{m.city}'s</span> same-day van service — delivery, errands and light hauling with a flat price up front. Scroll to ride along on a job.
          </p>
          <a
            href="#bookSec"
            className="inline-block mt-6 bg-[#0e9f6e] text-white font-bold text-[16px] px-[30px] py-[15px] rounded-full no-underline shadow-[0_12px_26px_rgba(14,159,110,.32)] hover:bg-[#0a7a54] hover:-translate-y-[1px] transition-all"
          >
            Get a flat price
          </a>
          <div className="mt-6 text-[13px] text-[#5c6a62] flex items-center gap-2">
            <span className="w-5 h-8 border-2 border-[#5c6a62] rounded-[10px] relative flex-none">
              <span className="absolute left-1/2 top-[6px] w-[3px] h-[7px] rounded-sm bg-[#5c6a62] -translate-x-1/2 animate-[wheel_1.6s_infinite]" />
            </span>
            Scroll — the van moves with you
          </div>
        </ScrollSection>

        {/* Stop 1 */}
        <ScrollSection align="right">
          <div className="stop">Stop 1 · The job</div>
          <h2 className="text-[clamp(30px,4vw,48px)] font-[800] font-bricolage tracking-tight leading-tight mb-3">
            Tell us what needs moving.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-[#5c6a62]">
            A dresser off Marketplace. Paperwork across town. A couch to the curb. Text it, call it, or drop it in the form — 30 seconds, no app, no account.
          </p>
        </ScrollSection>

        {/* Stop 2 */}
        <ScrollSection>
          <div className="stop">Stop 2 · The price</div>
          <h2 className="text-[clamp(30px,4vw,48px)] font-[800] font-bricolage tracking-tight leading-tight mb-3">
            Flat number before we roll.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-[#5c6a62]">
            You get one price, in minutes. That's the price you pay — no hourly meter running while we drive.
          </p>
          <ul className="list-none mt-[18px]">
            {[
              { label: "Same-day delivery", price: "from $45" },
              { label: "Errand runs", price: "from $45" },
              { label: "Light hauling", price: "from $75" },
            ].map((item) => (
              <li
                key={item.label}
                className="flex justify-between items-center py-3 border-b border-dashed border-black/15 font-semibold text-[15.5px]"
              >
                {item.label}
                <b className="text-[#0e9f6e] text-[16.5px]">{item.price}</b>
              </li>
            ))}
          </ul>
        </ScrollSection>

        {/* Stop 3 */}
        <ScrollSection align="right">
          <div className="stop">Stop 3 · On the move</div>
          <h2 className="text-[clamp(30px,4vw,48px)] font-[800] font-bricolage tracking-tight leading-tight mb-3">
            You'll know the second it's rolling.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-[#5c6a62]">
            A text when your job is on the road, and the owner behind the wheel — not a stranger from a gig app. Same person who quoted it, doing it.
          </p>
        </ScrollSection>

        {/* Delivered */}
        <ScrollSection>
          <div className="stop">Delivered · Proof in your texts</div>
          <h2 className="text-[clamp(30px,4vw,48px)] font-[800] font-bricolage tracking-tight leading-tight mb-3">
            Photo when it's done.
          </h2>
          <p className="text-[16.5px] leading-relaxed text-[#5c6a62]">
            Every job ends with a picture at the drop-off. Running {m.city} and the neighbors:
          </p>
          <div className="flex flex-wrap gap-2 mt-[18px]">
            {m.towns.map((town, i) => (
              <span
                key={town}
                className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold ${
                  i === 0
                    ? "bg-[#0e9f6e] text-white"
                    : "bg-white border border-black/12"
                }`}
              >
                {town}
              </span>
            ))}
          </div>
          <a
            href="#bookSec"
            className="inline-block mt-6 bg-[#0e9f6e] text-white font-bold text-[16px] px-[30px] py-[15px] rounded-full no-underline shadow-[0_12px_26px_rgba(14,159,110,.32)] hover:bg-[#0a7a54] transition-all"
          >
            Book your run ↓
          </a>
        </ScrollSection>

        {/* FAQ */}
        <ScrollSection>
          <div className="stop">Quick answers</div>
          <h2 className="text-[clamp(30px,4vw,48px)] font-[800] font-bricolage tracking-tight leading-tight mb-3">
            Questions you shouldn't have to dig for.
          </h2>
          <FAQSection />
        </ScrollSection>

        {/* Booking */}
        <ScrollSection align="right" id="bookSec">
          <div className="stop">Your turn · The work we do</div>
          <h2 className="text-[clamp(30px,4vw,48px)] font-[800] font-bricolage tracking-tight leading-tight mb-3">
            Pick it. Price it. Done.
          </h2>
          <BookingSection market={market} />
        </ScrollSection>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-[#101613] text-[#9db3a8] px-[7vw] py-9 flex justify-between flex-wrap gap-3 text-[14px]">
        <div>
          <div className="text-white text-[18px] font-[800] font-bricolage">gridd</div>
          <div className="mt-1.5">GRIDD Technologies LLC · {m.city}, {m.state}</div>
        </div>
        <div className="self-center flex gap-4 items-center">
          <a href="/privacy" className="text-[#9db3a8] hover:text-white transition-colors no-underline text-[13px]">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/terms" className="text-[#9db3a8] hover:text-white transition-colors no-underline text-[13px]">Terms</a>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Owner-operated · Same-day when you call early</span>
        </div>
      </footer>

      <style jsx>{`
        .stop {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #0e9f6e;
          margin-bottom: 14px;
        }
        .stop::before {
          content: "";
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #0e9f6e;
          box-shadow: 0 0 0 3px rgba(14, 159, 110, 0.18);
        }
        @keyframes wheel {
          0% { opacity: 1; top: 6px; }
          70% { opacity: 0; top: 16px; }
          100% { opacity: 0; }
        }
        @media (max-width: 760px) {
          .rail .lab { display: none; }
        }
      `}</style>
    </div>
  );
}