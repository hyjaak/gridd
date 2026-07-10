import { Suspense } from "react";

export default function DmLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060606]" aria-hidden />}>{children}</Suspense>
  );
}
