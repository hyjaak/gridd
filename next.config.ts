import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Ensure .env.local is loaded before Next reads config (fixes missing NEXT_PUBLIC_* in some setups).
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  serverExternalPackages: ["stripe", "twilio"],
};

export default nextConfig;
