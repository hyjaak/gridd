"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { logIn } from "@/lib/auth";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const next = searchParams.get("next");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Only pass next when explicitly provided — no default.
      // logIn falls back to role-based routing (CEO → /dispatch, others → /).
      await logIn(email, password, next ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#101613] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-[48px] font-[800] font-bricolage text-[#0e9f6e] mb-4">gridd</div>
          <h1 className="text-white text-[24px] font-bold mb-2">Owner sign-in</h1>
          <p className="text-[#9db3a8] text-[14px]">Sign in to access your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-[14px] focus:outline-none focus:border-[#0e9f6e]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-[14px] focus:outline-none focus:border-[#0e9f6e]"
          />
          {error && <p className="text-red-400 text-[13px] text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0e9f6e] text-white font-bold text-[16px] py-3 rounded-full hover:bg-[#0a7a54] transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center mt-6 text-[12px] text-[#5c6a62]">
          <a href="/" className="text-[#7a8a7f] hover:text-white transition-colors no-underline">
            Back to home
          </a>
        </p>
      </div>
    </main>
  );
}
