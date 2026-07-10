"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, doc, getFirestore, onSnapshot, orderBy, query } from "firebase/firestore";
import { Check, CheckCheck } from "lucide-react";
import app from "@/lib/firebase";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { DmConversation, DmMessage } from "@/types";

function msgTime(raw: unknown): string {
  if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") {
    return (raw as { toDate: () => Date }).toDate().toLocaleString();
  }
  return "";
}

export default function AdminDmViewerPage() {
  const params = useParams();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : "";
  const { loading, ok } = useRequireAuth(["ceo"]);
  const [conv, setConv] = useState<(DmConversation & { id: string }) | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);

  useEffect(() => {
    if (!app || !conversationId) return;
    const db = getFirestore(app);
    const unsub = onSnapshot(doc(db, "conversations", conversationId), (snap) => {
      if (!snap.exists) {
        setConv(null);
        return;
      }
      setConv({ id: snap.id, ...(snap.data() as Omit<DmConversation, "id">) });
    });
    return () => unsub();
  }, [conversationId]);

  useEffect(() => {
    if (!app || !conversationId) return;
    const db = getFirestore(app);
    const q = query(collection(db, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmMessage, "id">) })) as DmMessage[]);
    });
    return () => unsub();
  }, [conversationId]);

  if (loading || !ok) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-[#060606] px-4 pb-12 pt-6">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <Link href="/admin/dashboard" className="text-sm text-[#3B82F6] hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-lg font-semibold text-zinc-100">Conversation (CEO)</h1>
      </div>
      <p className="mx-auto mt-2 max-w-2xl text-xs text-zinc-500">
        Full message history including content hidden per-user from their own view. IDs: {conversationId}
      </p>
      {conv ? (
        <p className="mx-auto mt-1 max-w-2xl text-xs text-zinc-400">
          Participants: {conv.participants.map((u) => conv.participantNames?.[u] ?? u).join(" · ")}
        </p>
      ) : null}

      <div className="mx-auto mt-6 max-w-2xl space-y-3">
        {messages.map((m) => {
          const hidden = (m.hiddenForUserIds?.length ?? 0) > 0;
          return (
            <div key={m.id} className="flex justify-start">
              <div
                className={[
                  "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
                  "bg-[#1a1a1a] text-zinc-100",
                  hidden ? "ring-1 ring-amber-500/50" : "",
                ].join(" ")}
              >
                {hidden ? (
                  <div className="mb-1 text-[10px] font-semibold text-amber-400">
                    🗑️ [Hidden from some users] — original retained
                  </div>
                ) : null}
                <div className="text-[10px] text-zinc-500">{m.senderName}</div>
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="mb-1 max-h-48 w-full rounded-lg object-cover" />
                ) : null}
                <div>{m.text}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                  <span>{msgTime(m.createdAt)}</span>
                  {m.read ? (
                    <span className="inline-flex items-center gap-0.5">
                      Read <CheckCheck className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      Sent <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
