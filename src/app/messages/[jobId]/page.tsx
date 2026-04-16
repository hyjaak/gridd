"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
} from "firebase/firestore";
import { Check, CheckCheck, MessageCircle } from "lucide-react";
import { firebaseApp } from "@/lib/firebase";
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

export default function JobMessagesPage() {
  const params = useParams();
  const jobId = String(params.jobId ?? "");
  const { user, role } = useAuth();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  const backHref =
    role === "driver" ? `/active` : `/track/${jobId}`;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#060606]">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#060606]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <BackButton href={backHref} inline />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--text)]">
              {job.serviceName}
            </div>
            <div className="truncate text-xs text-[var(--sub)]">Job messages</div>
          </div>
          <Link
            href={`/track/${jobId}`}
            className="text-xs text-[#00FF88] underline underline-offset-2"
          >
            Job
          </Link>
        </div>
      </div>

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
                  <span className="text-[10px] uppercase tracking-wider text-zinc-300">
                    GRIDD
                  </span>
                ) : null}
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-[var(--sub)]">
                  {m.smsSent ? (
                    <span className="inline-flex items-center gap-0.5 text-[#00FF88]" title="Also sent by SMS">
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
        <div className="mx-auto flex max-w-lg gap-2">
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
          <Button type="button" disabled={sending || !text.trim()} onClick={() => void send()}>
            Send
          </Button>
        </div>
      </div>
    </main>
  );
}
