import { Bebas_Neue } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { BitesProviders } from "./BitesProviders";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
});

export const metadata: Metadata = {
  title: "GRIDD Bites 🍗",
  description: "What the hood is eating right now—order, share, GRIDD it.",
};

export default function BitesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={bebas.variable}>
      <BitesProviders>{children}</BitesProviders>
    </div>
  );
}
