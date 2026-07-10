"use client";

import { BitesCartProvider } from "@/contexts/BitesCartContext";
import type { ReactNode } from "react";

export function BitesProviders({ children }: { children: ReactNode }) {
  return <BitesCartProvider>{children}</BitesCartProvider>;
}
