"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

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
            border: "1px solid #333",
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

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          textAlign: "center",
          background: "radial-gradient(ellipse at top, #00FF8811 0%, #060606 70%)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "#00FF88",
            fontWeight: 700,
            letterSpacing: 3,
            marginBottom: 16,
            textTransform: "uppercase",
          }}
        >
          The Neighborhood Economy
        </div>

        <h1
          style={{
            fontSize: 52,
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 16,
            maxWidth: 500,
          }}
        >
          Ditch anything.
          <br />
          <span style={{ color: "#00FF88" }}>Book everything.</span>
          <br />
          Own a piece of it.
        </h1>

        <p
          style={{
            fontSize: 16,
            color: "#888",
            maxWidth: 380,
            lineHeight: 1.7,
            marginBottom: 36,
          }}
        >
          11 services. Real providers. Real prices. Your wallet. Your community. Your neighborhood.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => router.push("/signup")}
            style={{
              background: "linear-gradient(135deg, #00FF88, #00CC66)",
              color: "#000",
              border: "none",
              borderRadius: 14,
              padding: "16px 32px",
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 8px 24px #00FF8844",
            }}
          >
            Get Started — It&apos;s Free
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            style={{
              background: "none",
              color: "#eee",
              border: "1px solid #333",
              borderRadius: 14,
              padding: "16px 32px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </div>
      </div>

      <div style={{ padding: "40px 24px" }}>
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#555",
            letterSpacing: 2,
            marginBottom: 20,
            textTransform: "uppercase",
          }}
        >
          11 Services In One App
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
          }}
        >
          {(
            [
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
            ] as const
          ).map(([icon, label, color]) => (
            <div
              key={label}
              style={{
                background: "#0a0a0a",
                border: `1px solid ${color}33`,
                borderRadius: 12,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 12, color, fontWeight: 700 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 32,
          padding: "32px 24px",
          borderTop: "1px solid #111",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["85%", "goes to drivers"],
            ["11", "services"],
            ["2%", "wallet interest"],
            ["3%", "card cashback"],
          ] as const
        ).map(([val, label]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#00FF88" }}>{val}</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "24px",
          textAlign: "center",
          borderTop: "1px solid #111",
          fontSize: 12,
          color: "#333",
        }}
      >
        © 2025 GRIDD Technologies, LLC · Atlanta, Georgia ·{" "}
        <span style={{ color: "#00FF88" }}>gridd.click</span>
      </div>
    </div>
  );
}
