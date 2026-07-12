"use client";

import { PHONE, PHONE_HREF } from "@/lib/constants";

type Props = {
  show: boolean;
  photoUrl: string | null;
};

export default function DeliveredCard({ show, photoUrl }: Props) {
  return (
    <div
      className={`fixed left-1/2 bottom-[26px] z-35 bg-white border border-black/10 rounded-2xl shadow-[0_30px_70px_rgba(16,22,19,.22)] px-5 py-[18px] flex gap-4 items-center max-w-[min(92vw,480px)] transition-transform duration-550 ease-[cubic-bezier(.2,.9,.25,1.15)] ${
        show ? "translate-x-[-50%] translate-y-0" : "translate-x-[-50%] translate-y-[140%]"
      }`}
    >
      <div className="w-[92px] flex-none bg-white border border-black/12 p-[5px] pb-4 rounded-[4px] shadow-[0_6px_16px_rgba(16,22,19,.18)] -rotate-3">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt="Delivery proof"
            className="w-full rounded-[2px] block bg-[#dfe9e1] aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square bg-[#dfe9e1] rounded-[2px]" />
        )}
      </div>
      <div>
        <h4 className="text-[16px] flex items-center gap-[7px] mb-[3px]">
          <span className="text-[#0e9f6e]">✓</span> Delivered · photo sent
        </h4>
        <p className="text-[12.5px] text-[#5c6a62] mb-2.5">
          Every GRIDD run ends exactly like this — proof in your texts.
        </p>
        <a
          href={PHONE_HREF}
          className="inline-block bg-[#0e9f6e] text-white font-bold text-[13.5px] px-[18px] py-2.5 rounded-full no-underline hover:bg-[#0a7a54] transition-colors"
        >
          Book your run — {PHONE}
        </a>
      </div>
    </div>
  );
}