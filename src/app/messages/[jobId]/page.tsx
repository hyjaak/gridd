"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Check, CheckCheck, MessageCircle, Phone } from "lucide-react";
import { firebaseApp, firebaseAuth, storage } from "@/lib/firebase";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import type { Job, JobChatMessage } from "@/types";

function msgTime(raw: unknown): string {
  if (raw instanceof Timestamp) return raw.toDate().toISOString();
  if (typeof raw === "string") return raw;
  return new Date().toISOString();
}

function parseDollarCents(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function JobMessagesPage() {
  const params = useParams();
  const jobId = String(params.jobId ?? "");
  const { user, role } = useAuth();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!firebaseApp || !jobId) return;
    const db = getFirestore(firebaseApp);
    const unsub = onSnapshot(doc(db, "jobs", jobId), (snap) => {
      if (!snap.exists()) {
        setJob(null);
        return;
      }
      const data = snap.data() as Omit<Job, "id">;
      setJob({ id: snap.id, ...data });
    });
    return () => unsub();
  }, [jobId]);

  useEffect(() => {
    if (!firebaseApp || !jobId) return;
    const db = getFirestore(firebaseApp);
    const q = query(
      collection(db, "jobs", jobId, "messages"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: JobChatMessage[] = snap.docs.map((d) => {
          const data = d.data() as Omit<JobChatMessage, "id" | "jobId">;
          const createdAt = msgTime(
            (data as { createdAt?: unknown }).createdAt,
          );
          return { id: d.id, jobId, ...data, createdAt };
        });
        setMessages(rows);
      },
      () => setMessages([]),
    );
    return () => unsub();
  }, [jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const allowed = useMemo(() => {
    if (!user || !job) return false;
    return job.customerUid === user.uid || job.providerUid === user.uid;
  }, [user, job]);

  const needsQuote = useMemo(() => {
    const d = job?.bookingDetails as { needsQuote?: boolean } | undefined;
    return Boolean(d?.needsQuote);
  }, [job?.bookingDetails]);

  const suggestedQuoteCents = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.senderRole !== "driver") continue;
      const cents = parseDollarCents(m.text);
      if (cents != null && cents > 0) return cents;
    }
    return null;
  }, [messages]);

  const otherName = useMemo(() => {
    if (!job || !user) return "…";
    if (job.customerUid === user.uid) {
      return job.providerName ?? "Provider";
    }
    return job.customerName ?? "Customer";
  }, [job, user]);

  const callPeer = useCallback(async () => {
    setCallError(null);
    const token = await firebaseAuth?.currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch(`/api/jobs/${jobId}/call-bridge`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      dialUrl?: string;
      error?: string;
      hint?: string;
    };
    if (!res.ok || !data?.ok || !data.dialUrl) {
      setCallError(data?.error ?? data?.hint ?? "Call unavailable.");
      return;
    }
    window.location.href = data.dialUrl;
  }, [jobId]);

  const confirmQuote = useCallback(async () => {
    if (!firebaseApp || !job || suggestedQuoteCents == null || role !== "customer") return;
    setQuoteBusy(true);
    try {
      const db = getFirestore(firebaseApp);
      const prev =
        typeof job.bookingDetails === "object" && job.bookingDetails
          ? (job.bookingDetails as Record<string, unknown>)
          : {};
      await updateDoc(doc(db, "jobs", jobId), {
        amountCents: suggestedQuoteCents,
        providerPayoutCents: Math.round(suggestedQuoteCents * 0.85),
        paymentStatus: "pending",
        bookingDetails: {
          ...prev,
          needsQuote: false,
          quoteConfirmedAt: new Date().toISOString(),
          quotedAmountCents: suggestedQuoteCents,
        },
      });
    } finally {
      setQuoteBusy(false);
    }
  }, [firebaseApp, job, jobId, role, suggestedQuoteCents]);

  async function send() {
    const t = text.trim();
    if (!firebaseApp || !user || !job || !allowed || !t) return;
    setSending(true);
    const db = getFirestore(firebaseApp);
    const senderRole: JobChatMessage["senderRole"] =
      role === "admin" ? "admin" : role === "driver" ? "driver" : "customer";
    try {
      await addDoc(collection(db, "jobs", jobId, "messages"), {
        jobId,
        senderUid: user.uid,
        senderRole,
        text: t,
        createdAt: serverTimestamp(),
        smsSent: false,
        readByUids: [user.uid],
      });
      setText("");
    } finally {
      setSending(false);
    }
  }

  async function sendPhoto(file: File) {
    if (!firebaseApp || !user || !job || !allowed || !storage) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const path = `job-chats/${jobId}/${Date.now()}_${safe}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      const attachmentUrl = await getDownloadURL(r);
      const db = getFirestore(firebaseApp);
      const senderRole: JobChatMessage["senderRole"] =
        role === "admin" ? "admin" : role === "driver" ? "driver" : "customer";
      await addDoc(collection(db, "jobs", jobId, "messages"), {
        jobId,
        senderUid: user.uid,
        senderRole,
        text: "📷 Photo",
        attachmentUrl,
        createdAt: serverTimestamp(),
        smsSent: false,
        readByUids: [user.uid],
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (job === undefined) {
    return (
      <main className="flex min-h-full flex-col bg-[#060606] px-4 pb-4 pt-16 sm:pt-10">
        <BackButton href="/home" />
        <div className="mx-auto w-full max-w-lg flex-1 animate-pulse rounded-2xl bg-white/5" />
      </main>
    );
  }

  if (!job || !allowed) {
    return (
      <main className="min-h-full bg-[#060606] px-4 pb-10 pt-16 sm:pt-10">
        <BackButton href="/home" />
        <p className="text-sm text-[var(--sub)]">You don&apos;t have access to this conversation.</p>
      </main>
    );
  }

  const backHref = role === "driver" ? `/active` : `/track/${jobId}`;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#060606]">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#060606]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href={backHref} inline />
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-[var(--text)]">
            {(otherName || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--text)]">{otherName}</div>
            <div className="truncate text-xs text-[var(--sub)]">{job.serviceName}</div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-[#00FF88] hover:bg-white/5"
            title="Call"
            onClick={() => void callPeer()}
          >
            <Phone className="h-4 w-4" aria-hidden />
          </button>
          <Link
            href={`/track/${jobId}`}
            className="text-xs text-[#00FF88] underline underline-offset-2"
          >
            Job
          </Link>
        </div>
        {callError ? (
          <p className="mx-auto mt-2 max-w-lg text-center text-[10px] text-amber-400/90">{callError}</p>
        ) : null}
      </div>

      {needsQuote ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="mx-auto max-w-lg text-xs leading-relaxed text-amber-100/95">
            <span className="font-semibold">⚠️ Quote needed.</span> This job requires a quote from the
            provider. Chat below to agree on pricing before paying.
          </div>
          {role === "customer" && suggestedQuoteCents != null ? (
            <div className="mx-auto mt-3 flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={quoteBusy}
                onClick={() => void confirmQuote()}
              >
                {quoteBusy
                  ? "…"
                  : `Confirm quote — ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(suggestedQuoteCents / 100)}`}
              </Button>
              <span className="text-[10px] text-amber-200/80">
                Taken from the latest provider message with a price.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        {messages.map((m) => {
          const mine = m.senderUid === user?.uid;
          const isAdmin = m.senderRole === "admin";
          const isCustomerMsg = m.senderRole === "customer";
          const align = isAdmin
            ? "mx-auto max-w-[90%]"
            : isCustomerMsg
              ? "mr-auto max-w-[85%]"
              : "ml-auto max-w-[85%]";
          const bubble = isAdmin
            ? "rounded-2xl bg-zinc-600/40 px-4 py-2 text-center text-sm text-zinc-100"
            : isCustomerMsg
              ? "rounded-2xl rounded-bl-md bg-blue-600/35 px-4 py-2 text-sm text-[var(--text)]"
              : "rounded-2xl rounded-br-md bg-[#14532d] px-4 py-2 text-sm text-[var(--text)]";
          const otherRead =
            (m.readByUids ?? []).filter((id) => id !== m.senderUid).length > 0;

          return (
            <div key={m.id} className={align}>
              <div className={bubble}>
                {isAdmin ? (
                  <span className="text-[10px] uppercase tracking-wider text-zinc-300">GRIDD</span>
                ) : null}
                {m.attachmentUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.attachmentUrl}
                    alt=""
                    className="mb-2 max-h-48 w-full rounded-lg object-cover"
                  />
                ) : null}
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-[var(--sub)]">
                  {m.smsSent ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[#00FF88]"
                      title="Also sent by SMS"
                    >
                      <MessageCircle className="h-3 w-3" />
                      SMS
                    </span>
                  ) : null}
                  {mine ? (
                    otherRead ? (
                      <CheckCheck className="h-3.5 w-3.5 text-[#00FF88]" aria-label="Read" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-[var(--sub)]" aria-label="Sent" />
                    )
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-white/10 bg-[#060606]/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendPhoto(f);
            }}
          />
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-lg text-[var(--text)] hover:bg-white/5 disabled:opacity-40"
            disabled={uploading || !allowed}
            title="Attach photo"
            onClick={() => fileRef.current?.click()}
          >
            📷
          </button>
          <Input
            className="flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="button"
            className="min-w-[72px] shrink-0 bg-[#00FF88] text-black hover:bg-[#00dd77]"
            disabled={sending || !text.trim()}
            onClick={() => void send()}
          >
            Send
          </Button>
        </div>
        {uploading ? (
          <p className="mx-auto mt-2 max-w-lg text-center text-[10px] text-[var(--sub)]">Uploading…</p>
        ) : null}
      </div>
    </main>
  );
}
