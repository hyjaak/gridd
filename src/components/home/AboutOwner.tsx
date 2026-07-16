"use client";

export default function AboutOwner() {
  return (
    <section className="min-h-screen flex items-center px-[7vw]">
      <div className="max-w-[530px] bg-white/88 backdrop-blur-md border border-black/8 rounded-3xl px-[38px] py-10 shadow-[0_30px_70px_rgba(16,22,19,.12)]">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Photo slot — left on desktop */}
          <div className="w-full sm:w-[160px] flex-none">
            <div className="aspect-square rounded-2xl bg-[#dfe9e1] flex items-center justify-center text-[11px] text-[#5c6a62] font-semibold text-center leading-relaxed border border-black/8">
              IBRAHIM<br />+ VAN<br />PHOTO
            </div>
          </div>
          {/* Copy — right */}
          <div className="flex-1 min-w-0">
            <div className="stop">The guy in the van</div>
            <h2 className="text-[clamp(28px,4vw,44px)] font-[800] font-bricolage tracking-tight leading-tight mt-2 mb-3 text-[#101613]">
              Hi, I'm Ibrahim.
            </h2>
            <p className="text-[15px] leading-relaxed text-[#5c6a62]">
              I started GRIDD because Dayton needed something faster and simpler than truck rentals and gig apps. When you text GRIDD, you're talking directly to me — and I'm the one showing up. Family roots in trucking, flat prices, photo proof, every run.
            </p>
            {/* Badge row */}
            <div className="flex flex-wrap gap-2 mt-4">
              {["Local Dayton business", "Owner-operated", "Family trucking roots"].map((badge) => (
                <span
                  key={badge}
                  className="text-[11.5px] font-semibold text-[#0e9f6e] bg-[#f2faf6] border border-[#0e9f6e]/20 rounded-full px-3 py-1"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
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
        }
        .stop::before {
          content: "";
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #0e9f6e;
          box-shadow: 0 0 0 3px rgba(14, 159, 110, 0.18);
        }
      `}</style>
    </section>
  );
}