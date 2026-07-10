"use client";

import { DriverDemoChrome } from "@/components/driver/DriverDemoChrome";
import { DriverFcmRegister } from "@/components/driver/DriverFcmRegister";

export default function DriverSegmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DriverDemoChrome />
      <DriverFcmRegister />
      {children}
    </>
  );
}
