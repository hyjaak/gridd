"use client";

const FAQS = [
  {
    q: "How fast can you get here?",
    a: "If you call before 2pm, same-day. After that, next morning — text us to check.",
  },
  {
    q: "How does pricing work?",
    a: "We quote a flat price before we roll. That number doesn't change — no hourly meter, no surge.",
  },
  {
    q: "Who shows up?",
    a: "The owner. Same person who quoted your job is the one carrying it.",
  },
  {
    q: "What can't you take?",
    a: "Full house moves, pianos, hazmat, and anything requiring two people. If you're not sure, text us — we'll tell you straight.",
  },
  {
    q: "A little outside the towns?",
    a: "Call us. Small mileage add, but we've done runs farther than you'd expect.",
  },
];

export default function FAQSection() {
  return (
    <div className="space-y-3">
      {FAQS.map((faq) => (
        <details
          key={faq.q}
          className="group bg-white border border-black/10 rounded-2xl overflow-hidden"
        >
          <summary className="flex items-center justify-between px-5 py-3.5 text-[13.5px] font-semibold text-[#101613] cursor-pointer list-none hover:bg-gray-50 transition-colors">
            {faq.q}
            <svg
              className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform flex-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-4 text-[13px] text-[#5c6a62] leading-relaxed">
            {faq.a}
          </div>
        </details>
      ))}
    </div>
  );
}