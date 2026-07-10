import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { firebaseAuth } from "@/lib/firebase";
import { makeConversationId, truncateDmPreview } from "@/lib/dm-utils";
import { sanitizeForFirestore } from "@/lib/sanitizeFirestore";
import type { DmConversation } from "@/types";

export async function fetchPublicProfile(
  uid: string,
): Promise<{ name: string; photo: string | null }> {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  const res = await fetch("/api/users/public-profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ uid }),
  });
  const j = (await res.json()) as { ok?: boolean; name?: string; photo?: string | null };
  if (!res.ok || !j.ok) return { name: "User", photo: null };
  return { name: j.name ?? "User", photo: j.photo ?? null };
}

export async function ensureDmConversation(
  db: Firestore,
  myUid: string,
  otherUid: string,
  names: { myName: string; myPhoto: string | null; otherName: string; otherPhoto: string | null },
): Promise<string> {
  const convId = makeConversationId(myUid, otherUid);
  const ref = doc(db, "conversations", convId);
  const participants = myUid < otherUid ? [myUid, otherUid] : [otherUid, myUid];
  await setDoc(
    ref,
    sanitizeForFirestore({
      participants,
      participantNames: {
        [myUid]: names.myName,
        [otherUid]: names.otherName,
      },
      participantPhotos: {
        [myUid]: names.myPhoto,
        [otherUid]: names.otherPhoto,
      },
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      lastMessageBy: "",
      messageCount: 0,
      unreadCount: { [myUid]: 0, [otherUid]: 0 },
      createdAt: serverTimestamp(),
      isBlocked: false,
      blockedBy: null,
      hiddenForUsers: [],
    }),
    { merge: true },
  );
  return convId;
}

export async function sendDmText(
  db: Firestore,
  convId: string,
  myUid: string,
  myName: string,
  otherUid: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const convRef = doc(db, "conversations", convId);
  const snap = await getDoc(convRef);
  const c = snap.data() as DmConversation | undefined;
  if (c?.isBlocked) throw new Error("blocked");

  const msgRef = doc(collection(db, "conversations", convId, "messages"));
  const batch = writeBatch(db);
  batch.set(
    msgRef,
    sanitizeForFirestore({
      senderId: myUid,
      senderName: myName,
      text: trimmed,
      imageUrl: null,
      createdAt: serverTimestamp(),
      read: false,
      readAt: null,
      deleted: false,
      hiddenForUserIds: [],
    }),
  );
  batch.update(convRef, {
    lastMessage: truncateDmPreview(trimmed),
    lastMessageAt: serverTimestamp(),
    lastMessageBy: myUid,
    messageCount: increment(1),
    [`unreadCount.${otherUid}`]: increment(1),
    [`unreadCount.${myUid}`]: 0,
    hiddenForUsers: arrayRemove(myUid),
  });
  await batch.commit();
}

export async function sendDmImage(
  db: Firestore,
  convId: string,
  myUid: string,
  myName: string,
  otherUid: string,
  imageUrl: string,
  caption: string,
): Promise<void> {
  const convRef = doc(db, "conversations", convId);
  const snap = await getDoc(convRef);
  const c = snap.data() as DmConversation | undefined;
  if (c?.isBlocked) throw new Error("blocked");

  const msgRef = doc(collection(db, "conversations", convId, "messages"));
  const batch = writeBatch(db);
  batch.set(
    msgRef,
    sanitizeForFirestore({
      senderId: myUid,
      senderName: myName,
      text: caption.trim() || "📷 Photo",
      imageUrl,
      createdAt: serverTimestamp(),
      read: false,
      readAt: null,
      deleted: false,
      hiddenForUserIds: [],
    }),
  );
  batch.update(convRef, {
    lastMessage: caption.trim() ? truncateDmPreview(caption) : "📷 Photo",
    lastMessageAt: serverTimestamp(),
    lastMessageBy: myUid,
    messageCount: increment(1),
    [`unreadCount.${otherUid}`]: increment(1),
    [`unreadCount.${myUid}`]: 0,
    hiddenForUsers: arrayRemove(myUid),
  });
  await batch.commit();
}

export async function markDmMessagesRead(db: Firestore, convId: string, myUid: string): Promise<void> {
  const convRef = doc(db, "conversations", convId);
  await updateDoc(convRef, {
    [`unreadCount.${myUid}`]: 0,
  });

  const q = query(
    collection(db, "conversations", convId, "messages"),
    orderBy("createdAt", "desc"),
    limit(80),
  );
  const msgs = await getDocs(q);
  const batch = writeBatch(db);
  let n = 0;
  msgs.docs.forEach((d) => {
    const data = d.data() as { senderId?: string; read?: boolean };
    if (data.senderId && data.senderId !== myUid && !data.read) {
      batch.update(d.ref, { read: true, readAt: serverTimestamp() });
      n++;
    }
  });
  if (n > 0) await batch.commit();
}

export async function clearDmTyping(db: Firestore, convId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "conversations", convId), {
    [`typing.${uid}`]: false,
  });
}

export async function blockDmConversation(
  db: Firestore,
  convId: string,
  myUid: string,
): Promise<void> {
  await updateDoc(doc(db, "conversations", convId), {
    isBlocked: true,
    blockedBy: myUid,
  });
}

export async function unblockDmConversation(db: Firestore, convId: string): Promise<void> {
  await updateDoc(doc(db, "conversations", convId), {
    isBlocked: false,
    blockedBy: null,
  });
}

export async function hideDmForMe(db: Firestore, convId: string, myUid: string): Promise<void> {
  await updateDoc(doc(db, "conversations", convId), {
    hiddenForUsers: arrayUnion(myUid),
  });
}

/** Hide a single message from the current user's view only (CEO still sees full content in admin tools). */
export async function hideDmMessageForUser(
  db: Firestore,
  convId: string,
  messageId: string,
  myUid: string,
): Promise<void> {
  await updateDoc(doc(db, "conversations", convId, "messages", messageId), {
    hiddenForUserIds: arrayUnion(myUid),
  });
}
