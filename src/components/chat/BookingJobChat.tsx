"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { ensureChatMetadata, getDb } from "@/lib/ensure-chat-metadata";
import { isPreviewChatJobId } from "@/lib/roadside-chat";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";

type UiMsg = {
  id: string;
  from: "me" | "provider";
  name: string;
  text: string;
  createdAt?: string;
};

function msgTimeLabel(raw: unknown): string {
  let d: Date;
  if (raw instanceof Timestamp) d = raw.toDate();
  else if (typeof raw === "string") d = new Date(raw);
  else return "";
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function BookingJobChat({
  chatJobId,
  providerLabel,
  customerUid,
  selectedProviderUid,
  chatTitle = "💬 Chat with provider",
  emptyHint = "Messages save here before you book. After you pick a provider, chat continues on your job.",
  containerId = "booking-preview-chat",
}: {
  chatJobId: string;
  /** Shown as provider name in header area */
  providerLabel: string;
  customerUid: string;
  /** Top matched provider — used for participants metadata */
  selectedProviderUid?: string;
  chatTitle?: string;
  emptyHint?: string;
  containerId?: string;
}) {
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = useMemo(() => {
    const u = firebaseAuth?.currentUser;
    return u?.displayName ?? u?.email?.split("@")[0] ?? "You";
  }, []);

  useEffect(() => {
    if (!firebaseApp || !chatJobId) return;
    const db = getDb(firebaseApp);
    const col = collection(db, "chats", chatJobId, "messages");
    const unsub = onSnapshot(
      query(col),
      (snap) => {
        const sorted = snap.docs.slice().sort((a, b) => {
          const da = a.data().createdAt;
          const db_ = b.data().createdAt;
          const ta =
            da && typeof (da as { toMillis?: () => number }).toMillis === "function"
              ? (da as { toMillis: () => number }).toMillis()
              : 0;
          const tb =
            db_ && typeof (db_ as { toMillis?: () => number }).toMillis === "function"
              ? (db_ as { toMillis: () => number }).toMillis()
              : 0;
          return ta - tb;
        });
        const rows: UiMsg[] = sorted.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const isUser = data.role === "user" || data.role === "customer";
          const createdAt = data.createdAt as unknown;
          return {
            id: d.id,
            from: isUser ? "me" : "provider",
            name: String(data.senderName ?? (isUser ? "You" : providerLabel)),
            text: String(data.text ?? ""),
            createdAt: msgTimeLabel(createdAt),
          };
        });
        setMsgs(rows);
      },
      () => setMsgs([]),
    );
    return () => unsub();
  }, [firebaseApp, chatJobId, providerLabel]);

  useEffect(() => {
    if (!firebaseApp || !chatJobId) return;
    const db = getDb(firebaseApp);
    const cref = doc(db, "chats", chatJobId);
    const unsub = onSnapshot(cref, (snap) => {
      if (!snap.exists()) {
        setTyping(false);
        return;
      }
      const data = snap.data() as {
        typingProviderUid?: string;
        typingAt?: { toMillis?: () => number };
      };
      const uid = data.typingProviderUid;
      const at = data.typingAt;
      const t =
        at && typeof at.toMillis === "function"
          ? at.toMillis()
          : at && typeof (at as { seconds?: number }).seconds === "number"
            ? (at as { seconds: number }).seconds * 1000
            : 0;
      const recent = t > 0 && Date.now() - t < 6000;
      setTyping(Boolean(uid && recent));
    });
    return () => unsub();
  }, [firebaseApp, chatJobId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const scrollToInput = useCallback(() => {
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const send = useCallback(async () => {
    const t = input.trim();
    if (!t || !firebaseApp || !customerUid) return;
    const db = getDb(firebaseApp);
    const u = firebaseAuth?.currentUser;
    if (!u) return;
    try {
      const participants = [customerUid, selectedProviderUid].filter(Boolean) as string[];
      await ensureChatMetadata(db, chatJobId, { participants });
      const msgData = sanitizeForFirestore({
        text: t,
        senderId: u.uid,
        senderName: displayName || "",
        role: "user",
        createdAt: serverTimestamp(),
        read: false,
      });
      console.log("POST DATA:", JSON.stringify({ ...msgData, createdAt: "[serverTimestamp]" }));
      await addDoc(collection(db, "chats", chatJobId, "messages"), msgData);
      setInput("");
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

      const token = await u.getIdToken().catch(() => null);
      if (token && !isPreviewChatJobId(chatJobId)) {
        void fetch(`/api/jobs/${chatJobId}/message-notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: t.slice(0, 140) }),
        }).catch(() => null);
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not send message.");
    }
  }, [input, firebaseApp, customerUid, chatJobId, displayName, selectedProviderUid]);

  return (
    <div
      id={containerId}
      className="mb-4 rounded-[14px] border border-[#2a2a2a] bg-[#191919] p-4"
      style={{ fontFamily: "var(--font-dm-sans), ui-sans-serif, sans-serif" }}
    >
      <div
        className="mb-3 flex items-center justify-between gap-2"
        style={{ fontFamily: "var(--font-syne), ui-sans-serif, sans-serif" }}
      >
        <div>
          <span className="text-[13px] font-bold text-[#888]">{chatTitle}</span>
          <div className="text-[11px] text-[#555]">with {providerLabel}</div>
        </div>
        <button
          type="button"
          className="text-[11px] font-semibold text-[#ff6b00] underline-offset-2 hover:underline"
          onClick={() => scrollToInput()}
        >
          Jump to input
        </button>
      </div>
      <div className="mb-3 max-h-[220px] space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 ? (
          <p className="text-center text-xs text-[#555]">{emptyHint}</p>
        ) : null}
        {msgs.map((m) => (
          <div
            key={m.id}
            className={["flex gap-2", m.from === "me" ? "flex-row-reverse" : "flex-row"].join(" ")}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#0a0a0a] text-sm"
              aria-hidden
            >
              {m.from === "provider" ? "🛞" : "🙂"}
            </div>
            <div className={m.from === "me" ? "text-right" : "text-left"}>
              <div className="text-[11px] font-semibold text-[#888]">
                {m.name}
                {m.createdAt ? <span className="ml-2 font-normal text-[#555]">· {m.createdAt}</span> : null}
              </div>
              <div
                className={[
                  "mt-1 inline-block max-w-[min(100%,280px)] rounded-[14px] border px-3 py-2 text-[13px] leading-snug",
                  m.from === "me"
                    ? "border-[#3dff7a]/40 bg-[#3dff7a]/10 text-[#eeeeee]"
                    : "border-[#2a2a2a] bg-[#0a0a0a] text-[#eeeeee]",
                ].join(" ")}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}
        {typing ? (
          <div className="text-[11px] italic text-[#888]">Provider is typing…</div>
        ) : null}
        <div ref={endRef} aria-hidden />
      </div>
      <div className="flex items-center gap-2 border-t border-[#2a2a2a] pt-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message your provider…"
          className="min-h-[48px] flex-1 rounded-[22px] border border-[#2a2a2a] bg-[#111] px-4 text-sm text-[#eeeeee] outline-none placeholder:text-[#555] focus:border-[#ff6b00]/60"
        />
        <button
          type="button"
          onClick={() => void send()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white transition hover:brightness-110"
          style={{
            fontFamily: "var(--font-syne), sans-serif",
            background: "linear-gradient(180deg, #ff6b00 0%, #ff9500 100%)",
            boxShadow: "0 4px 14px rgba(255, 107, 0, 0.35)",
          }}
          title="Send"
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
