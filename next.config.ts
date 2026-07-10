import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Ensure .env.local is loaded before Next reads config (fixes missing NEXT_PUBLIC_* in some setups).
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  serverExternalPackages: ["stripe", "twilio"],
  async redirects() {
    return [
      { source: "/driver/wallet", destination: "/driver/profile", permanent: true },
      { source: "/agreements", destination: "/terms", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/jobs", destination: "/driver/jobs" }];
  },
};

export default nextConfig;
