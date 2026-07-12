import type { Metadata } from "next";
import { PHONE, PHONE_HREF } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy — GRIDD",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#eef3ef] text-[#101613] font-inter px-6 py-20 max-w-3xl mx-auto">
      <h1 className="text-3xl font-[800] font-bricolage mb-6">Privacy Policy</h1>
      <p className="text-sm text-[#5c6a62] mb-8">Last updated: July 2026</p>
      <div className="space-y-5 text-[15px] leading-relaxed text-[#5c6a62]">
        <p>
          GRIDD Technologies LLC (&ldquo;GRIDD,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) operates the gridd.click website and provides local delivery, errand, and light hauling services.
        </p>
        <h2 className="text-[#101613] font-semibold text-base">Information We Collect</h2>
        <p>
          When you book a service, we collect your name, phone number, pickup and drop-off locations, and a description of the job. We use this information solely to provide and communicate about your delivery.
        </p>
        <h2 className="text-[#101613] font-semibold text-base">How We Use It</h2>
        <p>
          Your phone number is used to text you a price, confirm the job, send updates while we're on the move, and deliver your proof-of-delivery photo. We do not sell, rent, or share your information with third parties for their marketing.
        </p>
        <h2 className="text-[#101613] font-semibold text-base">Data Retention</h2>
        <p>
          Job records are retained for operational and tax purposes. You may request deletion of your data by texting us at {PHONE}.
        </p>
        <h2 className="text-[#101613] font-semibold text-base">Contact</h2>
        <p>
          Questions? Text <a href={PHONE_HREF} className="text-[#0e9f6e] font-semibold">{PHONE}</a>.
        </p>
      </div>
    </main>
  );
}