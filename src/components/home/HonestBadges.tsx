"use client";

const BADGES = [
  "Owner-operated",
  "Flat pricing, no hidden fees",
  "Photo-proof delivery",
  "Pay after completion",
  "Local Dayton business",
];

export default function HonestBadges() {
  return (
    <div className="relative z-10 bg-[#eef3ef] border-t border-b border-black/8">
      <div className="px-[7vw] py-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
        {BADGES.map((badge) => (
          <span
            key={badge}
            className="text-[12.5px] text-[#5c6a62] font-semibold flex items-center gap-1.5"
          >
            <span className="text-[#0e9f6e] text-[14px]">✓</span>
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}