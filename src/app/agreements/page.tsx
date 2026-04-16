"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  arrayUnion,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { UserRole } from "@/types";
import { syncSession } from "@/lib/auth";
import { setClientSessionCookies } from "@/lib/session-cookies";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BackButton } from "@/components/BackButton";
import {
  COMMUNITY_RULES_BODY,
  FOUNDER_LETTER_BODY,
  PAYMENT_POLICY_BODY,
  PRIVACY_POLICY_BODY,
  PROVIDER_AGREEMENT_BODY,
  SCROLL_FOOTER,
  USER_AGREEMENT_BODY,
  ZERO_TOLERANCE_BODY,
} from "@/lib/agreements-content";

type Doc = {
  id: DocId;
  title: string;
  subtitle: string;
  requiredFor: Array<UserRole | "all" | "none">;
  color: string;
  icon: string;
  body: string;
};

type DocId =
  | "founder_letter"
  | "terms"
  | "privacy"
  | "provider_agreement"
  | "community"
  | "payments"
  | "zerotolerance";

const DOCS: Doc[] = [
  {
    id: "founder_letter",
    title: "A Letter From The Founder",
    subtitle: "Why GRIDD exists, and how we protect the neighborhood.",
    requiredFor: ["none"],
    color: "#00FF88",
    icon: "✊",
    body: "A Letter From The Founder\n\n" + FOUNDER_LETTER_BODY + SCROLL_FOOTER,
  },
  {
    id: "terms",
    title: "User Agreement",
    subtitle: "The rules for using GRIDD.",
    requiredFor: ["all"],
    color: "#3B82F6",
    icon: "📋",
    body: "User Agreement\n\n" + USER_AGREEMENT_BODY + SCROLL_FOOTER,
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    subtitle: "How we collect, use, and protect your data.",
    requiredFor: ["all"],
    color: "#8B5CF6",
    icon: "🔒",
    body: "Privacy Policy\n\n" + PRIVACY_POLICY_BODY + SCROLL_FOOTER,
  },
  {
    id: "provider_agreement",
    title: "Provider Agreement",
    subtitle: "Required for drivers only.",
    requiredFor: ["driver"],
    color: "#FF6B00",
    icon: "🚛",
    body: "Provider Agreement\n\n" + PROVIDER_AGREEMENT_BODY + SCROLL_FOOTER,
  },
  {
    id: "community",
    title: "The Porch Community Rules",
    subtitle: "Keep the neighborhood safe, helpful, and respectful.",
    requiredFor: ["none"],
    color: "#D4A574",
    icon: "🪑",
    body: "The Porch Community Rules\n\n" + COMMUNITY_RULES_BODY + SCROLL_FOOTER,
  },
  {
    id: "payments",
    title: "Payment & Refund Policy",
    subtitle: "Payments, refunds, and dispute handling.",
    requiredFor: ["none"],
    color: "#FFB800",
    icon: "💳",
    body: "Payment & Refund Policy\n\n" + PAYMENT_POLICY_BODY + SCROLL_FOOTER,
  },
  {
    id: "zerotolerance",
    title: "Zero Tolerance Policy",
    subtitle: "Harassment, fraud, and abuse result in removal.",
    requiredFor: ["all"],
    color: "#ef4444",
    icon: "🚫",
    body: "Zero Tolerance Policy\n\n" + ZERO_TOLERANCE_BODY + SCROLL_FOOTER,
  },
];

export default function AgreementsPage() {
  const router = useRouter();
  const [signed, setSigned] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [scrolledToBottom, setScrolledToBottom] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load existing signatures — run when auth is ready (mount often has no currentUser yet)
  useEffect(() => {
    const auth = getAuth();
    const loadSigned = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        setSigned((data.agreementsSigned as string[]) || []);
        setRole((data.role as UserRole) ?? null);
        return;
      }
      const provSnap = await getDoc(doc(db, "providers", user.uid));
      if (provSnap.exists()) {
        const data = provSnap.data();
        setSigned((data.agreementsSigned as string[]) || []);
        setRole((data.role as UserRole) ?? "driver");
      }
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setSigned([]);
        setRole(null);
        setLoading(false);
        return;
      }
      void loadSigned().finally(() => setLoading(false));
    });
    return () => unsub();
  }, []);

  const requiredDocs = useMemo(() => {
    const base = ["terms", "privacy", "zerotolerance"];
    if (role === "driver") return [...base, "provider_agreement"];
    return base;
  }, [role]);

  const allSigned = requiredDocs.every((d) => signed.includes(d));

  const requiredSignedCount = requiredDocs.filter((d) => signed.includes(d)).length;
  const progressPct = requiredDocs.length
    ? Math.round((requiredSignedCount / requiredDocs.length) * 100)
    : 0;

  const visibleDocs = useMemo(() => {
    if (!role) return DOCS;
    return DOCS.filter(
      (d) => d.requiredFor.includes("all") || d.requiredFor.includes(role),
    );
  }, [role]);

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <div className="text-sm text-[var(--sub)]">Loading agreements…</div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#060606] pt-16 sm:pt-6">
      <BackButton href="/" />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="text-center">
          <div className="text-4xl font-semibold tracking-tight text-[#00FF88]">GRIDD</div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
            Before You Enter GRIDD
          </h1>
          <p className="mt-2 text-sm text-[var(--sub)]">
            Read and agree to continue. This protects you and your community.
          </p>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between text-xs text-[var(--sub)]">
            <span>
              {requiredSignedCount} of {requiredDocs.length} required signed
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--card)] ring-1 ring-[var(--border)]">
            <div className="h-full bg-[#00FF88] transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          {error ? <div className="mt-3 text-xs text-red-400">{error}</div> : null}
        </Card>

        <div className="space-y-3">
          {visibleDocs.map((d) => {
            const req = role ? requiredDocs.includes(d.id) : false;
            const done = signed.includes(d.id);
            const open = Boolean(expanded[d.id]);
            const canAgree = Boolean(scrolledToBottom[d.id]);

            return (
              <Card
                key={d.id}
                className={[
                  "overflow-hidden p-0 transition-colors",
                  done ? "border-[#00FF88] bg-emerald-500/[0.06]" : "border-[var(--border)]",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="w-full px-5 py-4 text-left"
                  onClick={() => setExpanded((p) => ({ ...p, [d.id]: !p[d.id] }))}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)]"
                        style={{ background: `${d.color}22` }}
                      >
                        <span className="text-lg">{d.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-[var(--text)]">{d.title}</div>
                          {done ? (
                            <span className="text-sm font-semibold text-[#00FF88]" aria-hidden>
                              ✅
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-[var(--sub)]">{d.subtitle}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {req ? (
                        <span className="rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                          Required
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--sub)]">
                          Optional
                        </span>
                      )}
                      <span className="text-xs text-[var(--sub)]">{open ? "−" : "+"}</span>
                    </div>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-[var(--border)] px-5 py-4">
                    <div
                      ref={(el) => {
                        scrollRefs.current[d.id] = el;
                      }}
                      onScroll={() => {
                        const el = scrollRefs.current[d.id];
                        if (!el) return;
                        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
                        if (atBottom) setScrolledToBottom((p) => ({ ...p, [d.id]: true }));
                      }}
                      className="max-h-[42vh] overflow-auto rounded-xl border border-[var(--border)] bg-[#060606] px-4 py-3 text-sm leading-6 text-[var(--text)]"
                    >
                      <pre className="whitespace-pre-wrap font-sans">{d.body}</pre>
                      <div className="mt-8 text-xs text-[var(--sub)]">End of document</div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-xs text-[var(--sub)]">
                        {canAgree ? "Scroll complete." : "Scroll to the bottom (optional — you can still agree)."}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={done || savingId === d.id}
                        onClick={async () => {
                          const docId = d.id;
                          setSavingId(docId);
                          setError(null);
                          try {
                            const auth = getAuth();
                            const currentUser = auth.currentUser;

                            if (!currentUser) {
                              alert("Please sign in first");
                              router.push("/login");
                              return;
                            }

                            const userRef = doc(db, "users", currentUser.uid);
                            const providerRef = doc(db, "providers", currentUser.uid);

                            const userSnap = await getDoc(userRef);
                            const ref = userSnap.exists() ? userRef : providerRef;

                            try {
                              await updateDoc(ref, {
                                agreementsSigned: arrayUnion(docId),
                              });
                            } catch (updateErr) {
                              // updateDoc fails if document does not exist — create/merge instead
                              await setDoc(
                                ref,
                                { agreementsSigned: arrayUnion(docId) },
                                { merge: true },
                              );
                            }

                            if (userSnap.exists() && role === "driver") {
                              try {
                                await updateDoc(providerRef, {
                                  agreementsSigned: arrayUnion(docId),
                                });
                              } catch {
                                await setDoc(
                                  providerRef,
                                  {
                                    uid: currentUser.uid,
                                    agreementsSigned: arrayUnion(docId),
                                  },
                                  { merge: true },
                                );
                              }
                            }

                            setSigned((prev) =>
                              prev.includes(docId) ? prev : [...prev, docId],
                            );
                            console.log("Agreement saved:", docId);
                            const synced = await syncSession();
                            if (!synced.ok) {
                              throw new Error(synced.error);
                            }
                          } catch (error: unknown) {
                            console.error("Error saving agreement:", error);
                            const msg =
                              error instanceof Error ? error.message : String(error);
                            alert("Could not save. Error: " + msg);
                            setError("Could not save agreement. Check your connection.");
                          } finally {
                            setSavingId(null);
                          }
                        }}
                      >
                        {savingId === d.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text)] border-t-transparent" />
                            Saving…
                          </span>
                        ) : done ? (
                          "Agreed"
                        ) : (
                          "I Agree"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>

        <div className="sticky bottom-0 z-30 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[#060606]/95 p-4 backdrop-blur">
            <Button
              type="button"
              disabled={!allSigned}
              onClick={async () => {
                if (!allSigned) return;
                const auth = getAuth();
                const user = auth.currentUser;
                if (!user) return;

                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists()) {
                  const r = userSnap.data().role as UserRole;
                  setClientSessionCookies(user.uid, r, true);
                  const synced = await syncSession();
                  if (!synced.ok) {
                    console.warn("[agreements] syncSession:", synced.error);
                  }
                  if (r === "admin") router.push("/admin/dashboard");
                  else if (r === "driver") router.push("/jobs");
                  else router.push("/home");
                  return;
                }

                const provSnap = await getDoc(doc(db, "providers", user.uid));
                if (provSnap.exists()) {
                  setClientSessionCookies(user.uid, "driver", true);
                  const synced = await syncSession();
                  if (!synced.ok) {
                    console.warn("[agreements] syncSession:", synced.error);
                  }
                  router.push("/jobs");
                }
              }}
              className={[
                "min-h-[48px] w-full text-base",
                allSigned
                  ? "bg-[#00FF88] text-black shadow-[0_0_28px_rgba(0,255,136,0.45)]"
                  : "cursor-not-allowed bg-[var(--card)] text-[var(--sub)] border border-[var(--border)]",
              ].join(" ")}
            >
              Enter GRIDD
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
