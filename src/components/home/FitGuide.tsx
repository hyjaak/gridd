"use client";

const FITS = [
  "Queen mattress (seats down)",
  "Dresser",
  "Loveseat",
  "TV up to 75\"",
  "15+ boxes",
  "Marketplace & storage-unit runs",
];

const NOT_US = [
  "Full sofas & sectionals",
  "Large appliances",
  "Full home moves",
  "Pianos",
  "Two-person jobs",
];

export default function FitGuide() {
  return (
    <div className="my-5 bg-white border border-black/10 rounded-2xl px-5 py-5">
      <h3 className="text-[16px] font-[800] font-bricolage tracking-tight text-[#101613] mb-3">
        Will it fit? Almost definitely.
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {/* FITS column */}
        <div>
          <p className="text-[11.5px] font-bold text-[#0e9f6e] uppercase tracking-wider mb-1.5">✓ FITS</p>
          <ul className="space-y-1">
            {FITS.map((item) => (
              <li key={item} className="text-[13px] text-[#5c6a62] flex items-start gap-1.5">
                <span className="text-[#0e9f6e] font-bold flex-none mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        {/* NOT US column */}
        <div>
          <p className="text-[11.5px] font-bold text-[#5c6a62] uppercase tracking-wider mb-1.5 mt-3 sm:mt-0">✗ NOT US</p>
          <ul className="space-y-1">
            {NOT_US.map((item) => (
              <li key={item} className="text-[13px] text-[#5c6a62] flex items-start gap-1.5">
                <span className="text-[#b91c1c] font-bold flex-none mt-0.5">✗</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-[#5c6a62] border-t border-black/8 pt-3">
        Not sure? Text a photo of it to <strong className="text-[#0e9f6e]">(313) 825-9887</strong> — instant answer.
      </p>
    </div>
  );
}