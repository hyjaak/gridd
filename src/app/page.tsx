"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const CHIP_SERVICES = [
  ["🚛", "Haul", "#FF6B00"],
  ["📦", "Send", "#3B82F6"],
  ["🚗", "Ride", "#8B5CF6"],
  ["💪", "Help", "#F59E0B"],
  ["🌳", "Cuts", "#22c55e"],
  ["🌿", "Lawn", "#16a34a"],
  ["💧", "Wash", "#06B6D4"],
  ["❄️", "Snow", "#93C5FD"],
  ["🏠", "Gutter", "#A78BFA"],
  ["🔧", "Fence", "#D97706"],
  ["🛡️", "Protect", "#EC4899"],
] as const;

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const provSnap = await getDoc(doc(db, "providers", user.uid));

        if (userSnap.exists()) {
          const data = userSnap.data();
          const role = data.role as string | undefined;
          const signed = (data.agreementsSigned as string[] | undefined) ?? [];
          const required = ["terms", "privacy", "zerotolerance"];
          if (!required.every((d) => signed.includes(d))) {
            setLoading(false);
            router.push("/agreements");
            return;
          }
          if (role === "admin") {
            setLoading(false);
            router.push("/admin/dashboard");
            return;
          }
          if (data.onboardingComplete !== true) {
            setLoading(false);
            router.push("/onboarding");
            return;
          }
          if (role === "driver") {
            setLoading(false);
            router.push("/jobs");
            return;
          }
          setLoading(false);
          router.push("/home");
          return;
        }

        if (provSnap.exists()) {
          const pdata = provSnap.data();
          const signed = (pdata.agreementsSigned as string[] | undefined) ?? [];
          const required = ["terms", "privacy", "zerotolerance", "provider_agreement"];
          if (!required.every((d) => signed.includes(d))) {
            setLoading(false);
            router.push("/agreements");
            return;
          }
          if (pdata.onboardingComplete !== true) {
            setLoading(false);
            router.push("/onboarding");
            return;
          }
          setLoading(false);
          router.push("/jobs");
          return;
        }

        setShowLanding(true);
        setLoading(false);
      } else {
        setShowLanding(true);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#060606",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "3px solid #00FF88",
            borderTop: "3px solid transparent",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!showLanding) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060606",
        color: "#eeeeee",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: "#00FF88",
            letterSpacing: -1,
          }}
        >
          GRIDD
        </div>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            background: "none",
            border: "1px solid #fff",
            borderRadius: 20,
            padding: "8px 20px",
            color: "#eee",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Sign In
        </button>
      </div>

      {/* SECTION 1 — Hero */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px 56px",
          textAlign: "center",
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(0,255,136,0.25), transparent 55%), #060606",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#00FF88",
            fontWeight: 800,
            letterSpacing: 4,
            marginBottom: 20,
            textTransform: "uppercase",
          }}
        >
          THE NEIGHBORHOOD ECONOMY
        </div>

        <h1
          style={{
            fontSize: "clamp(36px, 8vw, 56px)",
            fontWeight: 900,
            lineHeight: 1.08,
            marginBottom: 12,
            maxWidth: 520,
          }}
        >
          <span style={{ color: "#ffffff" }}>Ditch anything.</span>
          <br />
          <span style={{ color: "#00FF88" }}>Book everything.</span>
          <br />
          <span style={{ color: "#ffffff" }}>Own a piece of it.</span>
        </h1>

        <p
          style={{
            fontSize: 16,
            color: "#888",
            maxWidth: 400,
            lineHeight: 1.75,
            marginBottom: 36,
          }}
        >
          11 services. Real providers. Real prices.
          <br />
          Your wallet. Your community. Your neighborhood.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => router.push("/signup")}
            style={{
              background: "linear-gradient(135deg, #00FF88, #00CC66)",
              color: "#000",
              border: "none",
              borderRadius: 14,
              padding: "16px 28px",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 8px 28px rgba(0,255,136,0.35)",
            }}
          >
            Get Started — It&apos;s Free
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            style={{
              background: "transparent",
              color: "#eee",
              border: "1px solid #ffffff",
              borderRadius: 14,
              padding: "16px 28px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </div>
      </div>

      {/* SECTION 2 — Services scroll */}
      <div style={{ padding: "8px 0 32px", borderTop: "1px solid #111" }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#555",
            letterSpacing: 2,
            marginBottom: 16,
            textTransform: "uppercase",
          }}
        >
          11 Services In One App
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "8px 24px 16px",
            scrollbarWidth: "thin",
          }}
        >
          {CHIP_SERVICES.map(([icon, label, color]) => (
            <div
              key={label}
              style={{
                flex: "0 0 auto",
                background: "#0a0a0a",
                border: `1px solid ${color}44`,
                borderRadius: 12,
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 13, color, fontWeight: 800 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3 — Stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 28,
          padding: "28px 20px",
          borderTop: "1px solid #111",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["85%", "→ to drivers"],
            ["11", "→ services"],
            ["2%", "→ wallet interest"],
            ["3%", "→ card cashback"],
          ] as const
        ).map(([val, label]) => (
          <div key={label} style={{ textAlign: "center", minWidth: 88 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#00FF88" }}>{val}</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.35 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* SECTION 4 — How it works */}
      <div style={{ padding: "40px 24px", borderTop: "1px solid #111" }}>
        <h2 style={{ textAlign: "center", fontSize: 20, fontWeight: 900, marginBottom: 28 }}>How It Works</h2>
        <div
          style={{
            display: "grid",
            gap: 24,
            maxWidth: 720,
            margin: "0 auto",
            gridTemplateColumns: "1fr",
          }}
        >
          {(
            [
              {
                step: "Step 1",
                icon: "📍",
                title: "Post your job",
                body: "Tell us what you need.\nWe match you with verified locals.",
              },
              {
                step: "Step 2",
                icon: "🚛",
                title: "Provider accepts",
                body: "A real person in your neighborhood\nshows up ready to work.",
              },
              {
                step: "Step 3",
                icon: "✅",
                title: "Done & rewarded",
                body: "Job complete. Rate your provider.\nEarn Ditch Points.",
              },
            ] as const
          ).map((s) => (
            <div
              key={s.step}
              style={{
                borderRadius: 16,
                border: "1px solid #1a1a1a",
                background: "#0a0a0a",
                padding: 20,
              }}
            >
              <div style={{ fontSize: 11, color: "#00FF88", fontWeight: 800, letterSpacing: 2, marginBottom: 8 }}>
                {s.step}
              </div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: "#888", lineHeight: 1.65, whiteSpace: "pre-line" }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 5 — Driver CTA */}
      <div
        style={{
          margin: "0 24px 32px",
          borderRadius: 20,
          padding: "40px 24px",
          textAlign: "center",
          background:
            "radial-gradient(ellipse 90% 80% at 50% 100%, rgba(255,107,0,0.35), transparent 60%), linear-gradient(180deg, #0f0a06, #060606)",
          border: "1px solid rgba(255,107,0,0.35)",
        }}
      >
        <h2 style={{ fontSize: "clamp(26px, 6vw, 36px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 16 }}>
          Got a truck? Put it to work.
        </h2>
        <p style={{ fontSize: 15, color: "#aaa", lineHeight: 1.75, maxWidth: 440, margin: "0 auto 12px" }}>
          Turn your vehicle into a business.
          <br />
          Keep 85% of every dollar. Build real equity.
          <br />
          Rise from Bronze to Elite.
        </p>
        <p style={{ fontSize: 13, color: "#666", lineHeight: 1.65, maxWidth: 400, margin: "0 auto 28px" }}>
          Keep 85% of every job. Build equity. Own a piece of GRIDD.
        </p>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            marginBottom: 28,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            color: "#eee",
          }}
        >
          <span>🥉 Bronze</span>
          <span style={{ color: "#555" }}>→</span>
          <span>🥈 Silver</span>
          <span style={{ color: "#555" }}>→</span>
          <span>🥇 Gold</span>
          <span style={{ color: "#555" }}>→</span>
          <span>💎 Elite</span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/signup")}
          style={{
            background: "#FF6B00",
            color: "#fff",
            border: "none",
            borderRadius: 14,
            padding: "16px 36px",
            fontSize: 16,
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(255,107,0,0.35)",
          }}
        >
          Become a Provider →
        </button>
      </div>

      {/* SECTION 6 — Porch preview */}
      <div style={{ padding: "0 24px 40px" }}>
        <h2 style={{ textAlign: "center", fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
          Your neighborhood has a voice
        </h2>
        <p style={{ textAlign: "center", fontSize: 14, color: "#888", marginBottom: 24 }}>
          The Porch — community reviews, debates & shoutouts
        </p>
        <div style={{ display: "grid", gap: 12, maxWidth: 520, margin: "0 auto" }}>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid #1a1a1a",
              background: "#0a0a0a",
              padding: 16,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#00FF88" }}>★★★★★ Best haul yet</div>
            <div style={{ fontSize: 14, color: "#ccc", marginTop: 8, lineHeight: 1.5 }}>
              &quot;Showed up in 20 minutes. Fair price. This is what GRIDD is about.&quot;
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 10 }}>— Alex · Oakhurst</div>
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid #1a1a1a",
              background: "#0a0a0a",
              padding: 16,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3B82F6" }}>Debate</div>
            <div style={{ fontSize: 14, color: "#ccc", marginTop: 8, lineHeight: 1.5 }}>
              &quot;Leaf blowers before 8am — fair or not?&quot;
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 10 }}>42 replies · The Porch</div>
          </div>
        </div>
      </div>

      {/* SECTION 7 — Footer */}
      <div
        style={{
          marginTop: "auto",
          padding: "28px 24px 40px",
          textAlign: "center",
          borderTop: "1px solid #111",
          fontSize: 12,
          color: "#444",
          lineHeight: 1.8,
        }}
      >
        © 2025 GRIDD Technologies, LLC
        <br />
        Atlanta, Georgia
        <br />
        <span style={{ color: "#00FF88", fontWeight: 700 }}>gridd.click</span>
      </div>
    </div>
  );
}
