import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans, Geist, Geist_Mono, Syne } from "next/font/google";
import { AuthProvider } from "@/providers/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "GRIDD — The Neighborhood Economy",
  description:
    "Book rides, home services, haul, roadside & more. PriceIQ™ pricing, The Porch for your block, and drivers who keep 85%.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${dmSans.variable} ${bebasNeue.variable} min-h-full antialiased`}
    >
      <body className="min-h-dvh w-full max-w-full overflow-x-hidden bg-[#060606] text-[#eeeeee]">
        <AuthProvider>
          <div className="page-wrapper w-full min-h-min">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
