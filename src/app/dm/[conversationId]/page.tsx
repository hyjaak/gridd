"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Check, CheckCheck, MoreVertical } from "lucide-react";
import { firebaseApp, firebaseAuth, storage } from "@/lib/firebase";
import { useRequireSignedIn } from "@/hooks/useRequireSignedIn";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CustomerNav } from "@/components/CustomerNav";
import { DriverNav } from "@/components/DriverNav";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  blockDmConversation,
  clearDmTyping,
  ensureDmConversation,
  fetchPublicProfile,
  hideDmForMe,
  hideDmMessageForUser,
  markDmMessagesRead,
  sendDmImage,
  sendDmText,
  unblockDmConversation,
} from "@/lib/dm-firestore";
import { formatDmMessageTime, makeConversationId, parseConversationParticipants } from "@/lib/dm-utils";
import type { DmConversation, DmMessage } from "@/types";

export default function DmChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = typeof params.conversationId === "string" ? params.conversationId : "";
  const { loading: gateLoading, ok } = useRequireSignedIn();
  const { user, profile, role } = useAuth();
  const isCeoViewer = role === "ceo";

  const [conv, setConv] = useState<(DmConversation & { id: string }) | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDetails, setReportDetails] = useState("");
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myUid = user?.uid ?? "";
  const parsed = useMemo(() => parseConversationParticipants(conversationId), [conversationId]);
  const otherUid = useMemo(() => {
    if (!parsed || !myUid) return "";
    return parsed[0] === myUid ? parsed[1] : parsed[0];
  }, [parsed, myUid]);

  const otherName = conv?.participantNames?.[otherUid] ?? "…";
  const otherPhoto = conv?.participantPhotos?.[otherUid] ?? null;
  const otherUserTyping = Boolean(otherUid && conv?.typing?.[otherUid]);

  useEffect(() => {
    if (!firebaseApp || !conversationId || !parsed) return;
    const db = getFirestore(firebaseApp);
    const unsub = onSnapshot(
      doc(db, "conversations", conversationId),
      (snap) => {
        if (!snap.exists()) {
          setConv(null);
          return;
        }
        setConv({ id: snap.id, ...(snap.data() as Omit<DmConversation, "id">) });
      },
      () => setConv(null),
    );
    return () => unsub();
  }, [conversationId, parsed]);

  useEffect(() => {
    if (!firebaseApp || !conversationId) return;
    const db = getFirestore(firebaseApp);
    const q = query(collection(db, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmMessage, "id">) })) as DmMessage[],
        );
      },
      (err) => {
        console.error("[dm messages]", err);
        setMessages([]);
      },
    );
    return () => unsub();
  }, [conversationId]);

  useEffect(() => {
    if (!firebaseApp || !conversationId || !myUid || !conv) return;
    const db = getFirestore(firebaseApp);
    void markDmMessagesRead(db, conversationId, myUid);
  }, [conversationId, myUid, conv?.id]);

  const visibleMessages = useMemo(() => {
    if (isCeoViewer) return messages;
    return messages.filter((m) => !m.hiddenForUserIds?.includes(myUid));
  }, [messages, myUid, isCeoViewer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length]);

  useEffect(
    () => () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (firebaseApp && conversationId && myUid) {
        const db = getFirestore(firebaseApp);
        void clearDmTyping(db, conversationId, myUid);
      }
    };
  }, [firebaseApp, conversationId, myUid]);

  const ensure = useCallback(async () => {
    if (!firebaseApp || !myUid || !otherUid || !user) return;
    const db = getFirestore(firebaseApp);
    const mine = profile?.name ?? user.displayName ?? user.email?.split("@")[0] ?? "Me";
    const myPhoto = user.photoURL ?? profile?.photoUrl ?? null;
    const other = await fetchPublicProfile(otherUid);
    await ensureDmConversation(db, myUid, otherUid, {
      myName: mine,
      myPhoto,
      otherName: other.name,
      otherPhoto: other.photo,
    });
  }, [firebaseApp, myUid, otherUid, user, profile?.name, profile?.photoUrl]);

  /** Create conversation doc immediately so the thread appears in Messages inbox (even before first send). */
  useEffect(() => {
    if (!firebaseApp || !myUid || !otherUid || !user || !parsed) return;
    void ensure();
  }, [firebaseApp, myUid, otherUid, user, parsed, ensure]);

  const send = async () => {
    if (!firebaseApp || !myUid || !otherUid || !user || !text.trim()) return;
    const db = getFirestore(firebaseApp);
    const myName = profile?.name ?? user.displayName ?? "You";
    setSending(true);
    try {
      await ensureDmConversation(db, myUid, otherUid, {
        myName,
        myPhoto: user.photoURL ?? null,
        otherName: otherName !== "…" ? otherName : (await fetchPublicProfile(otherUid)).name,
        otherPhoto: otherPhoto,
      });
      await sendDmText(db, conversationId, myUid, myName, otherUid, text);
      await clearDmTyping(db, conversationId, myUid);
      setText("");
      const token = await firebaseAuth?.currentUser?.getIdToken();
      await fetch("/api/dm/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          recipientUid: otherUid,
          senderName: myName,
          preview: text.trim().slice(0, 160),
          conversationId,
        }),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  const onPickPhoto = async (f: File | null) => {
    if (!f || !storage || !firebaseApp || !myUid || !otherUid || !user) return;
    const db = getFirestore(firebaseApp);
    const myName = profile?.name ?? user.displayName ?? "You";
    const path = `dm/${conversationId}/${Date.now()}_${f.name.replace(/[^\w.-]/g, "")}`;
    const sref = ref(storage, path);
    setSending(true);
    try {
      await uploadBytes(sref, f);
      const url = await getDownloadURL(sref);
      await ensureDmConversation(db, myUid, otherUid, {
        myName,
        myPhoto: user.photoURL ?? null,
        otherName: otherName !== "…" ? otherName : (await fetchPublicProfile(otherUid)).name,
        otherPhoto,
      });
      await sendDmImage(db, conversationId, myUid, myName, otherUid, url, "");
      await clearDmTyping(db, conversationId, myUid);
      const token = await firebaseAuth?.currentUser?.getIdToken();
      await fetch("/api/dm/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          recipientUid: otherUid,
          senderName: myName,
          preview: "📷 Photo",
          conversationId,
        }),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSending(false);
    }
  };

  const submitReport = async () => {
    const token = await firebaseAuth?.currentUser?.getIdToken();
    const snapshot = visibleMessages
      .slice(-15)
      .map((m) => `${m.senderName}: ${m.text}`)
      .join("\n");
    const res = await fetch("/api/dm/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        conversationId,
        otherUserId: otherUid,
        reason: "dm_report",
        details: reportDetails,
        snapshot,
      }),
    });
    const j = (await res.json()) as { ok?: boolean };
    if (res.ok && j.ok) {
      alert("Report submitted. Our team will review.");
      setReportOpen(false);
      setReportDetails("");
    } else {
      alert("Could not submit report.");
    }
  };

  if (gateLoading || !ok) return <LoadingScreen />;
  if (!parsed || !otherUid || myUid === otherUid) {
    return (
      <main className="min-h-screen bg-[#060606] px-4 py-10 text-[var(--sub)]">
        <p>Invalid conversation.</p>
        <button type="button" className="mt-4 text-[#ff6b00] hover:underline" onClick={() => router.push("/dm")}>
          Back
        </button>
      </main>
    );
  }

  const blocked = conv?.isBlocked === true;
  const iBlocked = conv?.blockedBy === myUid;
  const canSend = !blocked && myUid && otherUid;

  return (
    <main className="flex min-h-screen flex-col bg-[#060606] pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border)] bg-[#060606]/95 px-2 py-3 backdrop-blur">
        <BackButton href="/dm" inline />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#222] text-sm font-bold text-white">
            {otherPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherPhoto} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              otherName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--text)]">{otherName}</div>
            <div className="text-[10px] text-zinc-500">Messages</div>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5"
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-[var(--border)] bg-[#111] py-1 shadow-xl">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  setBlockConfirm(true);
                }}
              >
                {iBlocked ? "Unblock" : "Block"}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
              >
                Report
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteConfirm(true);
                }}
              >
                Delete conversation
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {blocked ? (
          <p className="text-center text-sm text-zinc-500">
            {iBlocked ? "You blocked this person. Unblock to message again." : "You can’t send messages in this conversation."}
          </p>
        ) : null}
        {visibleMessages.map((m) => {
          const mine = m.senderId === myUid;
          const hiddenFromSomeone = (m.hiddenForUserIds?.length ?? 0) > 0;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={[
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  mine
                    ? "bg-gradient-to-br from-[#ff6b00] to-[#ff9500] text-black"
                    : "bg-[#1a1a1a] text-[var(--text)]",
                  hiddenFromSomeone && isCeoViewer ? "ring-1 ring-amber-500/50" : "",
                ].join(" ")}
              >
                {isCeoViewer && hiddenFromSomeone ? (
                  <div className="mb-1 text-[10px] font-semibold text-amber-400">
                    🗑️ Hidden from at least one participant (content retained)
                  </div>
                ) : null}
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="mb-1 max-h-48 w-full rounded-lg object-cover" />
                ) : null}
                <div>{m.text}</div>
                <div
                  className={[
                    "mt-1 flex flex-wrap items-center justify-end gap-2 text-[10px]",
                    mine ? "text-black/70" : "text-zinc-500",
                  ].join(" ")}
                >
                  <span>{formatDmMessageTime(m.createdAt)}</span>
                  {mine ? (
                    m.read ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-900">
                        ✓✓ Seen <CheckCheck className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        ✓ Delivered <Check className="h-3 w-3" />
                      </span>
                    )
                  ) : null}
                  {!isCeoViewer && myUid ? (
                    <button
                      type="button"
                      className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-medium hover:bg-black/35"
                      onClick={async () => {
                        if (!firebaseApp) return;
                        const db = getFirestore(firebaseApp);
                        try {
                          await hideDmMessageForUser(db, conversationId, m.id, myUid);
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "Could not hide message");
                        }
                      }}
                    >
                      Delete for me
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {otherUserTyping ? (
          <div className="flex justify-start px-1">
            <div className="typing-indicator rounded-full border border-[var(--border)] bg-[#141414] px-3 py-2">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-[#060606] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {canSend ? (
          <div className="mx-auto flex max-w-lg items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2.5 text-lg"
              onClick={() => fileRef.current?.click()}
              aria-label="Photo"
            >
              📷
            </button>
            <Input
              className="flex-1"
              value={text}
              onChange={(e) => {
                const v = e.target.value;
                setText(v);
                if (!firebaseApp || !myUid || !conversationId) return;
                const db = getFirestore(firebaseApp);
                const convRef = doc(db, "conversations", conversationId);
                void updateDoc(convRef, { [`typing.${myUid}`]: true }).catch(() => {});
                if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                typingTimerRef.current = setTimeout(() => {
                  void updateDoc(convRef, { [`typing.${myUid}`]: false }).catch(() => {});
                }, 2000);
              }}
              placeholder="Message…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="button" className="shrink-0 px-4" disabled={sending || !text.trim()} onClick={() => void send()}>
              ➤
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-zinc-500">Cannot send message</p>
        )}
      </div>

      {blockConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[#111] p-5">
            <p className="text-sm font-semibold text-[var(--text)]">
              {iBlocked ? "Unblock" : `Block ${otherName}?`}
            </p>
            {!iBlocked ? (
              <p className="mt-2 text-xs text-zinc-500">They won&apos;t be able to message you.</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" type="button" onClick={() => setBlockConfirm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                type="button"
                onClick={async () => {
                  if (!firebaseApp) return;
                  const db = getFirestore(firebaseApp);
                  if (iBlocked) await unblockDmConversation(db, conversationId);
                  else await blockDmConversation(db, conversationId, myUid);
                  setBlockConfirm(false);
                }}
              >
                {iBlocked ? "Unblock" : "Block"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[#111] p-5">
            <p className="text-sm font-semibold text-[var(--text)]">Delete this conversation?</p>
            <p className="mt-2 text-xs text-zinc-500">Removes it from your inbox only. The other person still has their copy.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" type="button" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                type="button"
                onClick={async () => {
                  if (!firebaseApp) return;
                  const db = getFirestore(firebaseApp);
                  await hideDmForMe(db, conversationId, myUid);
                  setDeleteConfirm(false);
                  router.push("/dm");
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[#111] p-5">
            <h3 className="font-semibold text-[var(--text)]">Report conversation</h3>
            <textarea
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-black/40 px-3 py-2 text-sm text-[var(--text)]"
              rows={4}
              placeholder="What should we know?"
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" type="button" onClick={() => setReportOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" type="button" onClick={() => void submitReport()}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {role === "driver" ? <DriverNav /> : <CustomerNav />}
    </main>
  );
}
