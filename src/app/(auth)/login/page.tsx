"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { logIn, googleSignIn } from "@/lib/auth";

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 820px)").matches || "ontouchstart" in window;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const next = searchParams.get("next");

  // Handle redirect result on mount (mobile flow)
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        // Google sign-in succeeded via redirect
        try {
          await googleSignIn();
          // If we get here, user was already signed in — redirect
          window.location.assign(next || "/dispatch");
        } catch (err: any) {
          if (err.name === "GoogleNeedsRoleChoice") {
            setError(err.message);
            return;
          }
          setError(err.message || "Google sign-in failed");
        }
      })
      .catch((err) => {
        // Ignore if no redirect result
        if (err.code !== "auth/no-redirect-operation") {
          console.error("getRedirectResult error:", err);
        }
      });
  }, [next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await logIn(email, password, next ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      if (isMobile()) {
        // Mobile: use redirect
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
        // Page will redirect — this line won't execute
      } else {
        // Desktop: use popup
        await googleSignIn();
        // googleSignIn handles redirect — if we get here, user was already signed in
        // and finalizeGoogleSignIn redirected them.
        // But if they're a new user, GoogleNeedsRoleChoiceError is thrown.
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Google sign-in failed");
      }
    } finally {
      setGoogleLoading(false);
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

        {/* Google Sign-In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 bg-white rounded-xl px-4 py-3 mb-4 hover:bg-gray-100 transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="text-[#101613] text-[14px] font-semibold">
            {googleLoading ? "Signing in..." : "Continue with Google"}
          </span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-[#2a2a2a]" />
          <span className="text-[#5c6a62] text-[12px] font-medium">OR</span>
          <div className="flex-1 h-px bg-[#2a2a2a]" />
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