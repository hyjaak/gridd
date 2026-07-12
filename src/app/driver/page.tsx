"use client";

import Link from "next/link";
import { PHONE, PHONE_HREF } from "@/lib/constants";

export default function DriverMarketingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-5 py-4">
          <Link href="/" className="text-lg font-bold text-gray-900">
            GRIDD
          </Link>
          <a
            href={`tel:${PHONE_HREF}`}
            className="text-sm text-[#0e9f6e] font-semibold hover:underline"
          >
            {PHONE}
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-20 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
          🚛
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          GRIDD crew applications opening soon
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mx-auto leading-relaxed mb-8">
          We're building our Dayton crew. Text us if you're interested in driving — we'll
          let you know when applications open.
        </p>
        <a
          href={`tel:${PHONE_HREF}`}
          className="inline-block bg-[#0e9f6e] text-white rounded-full px-8 py-3 text-sm font-semibold hover:bg-[#0c8a5e] transition-colors"
        >
          Text us at {PHONE}
        </a>
        <p className="mt-6 text-sm text-gray-400">
          <Link href="/" className="text-[#0e9f6e] hover:underline">Back to GRIDD</Link>
        </p>
      </main>
    </div>
  );
}