import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { fetchBusinessMenuDoorDash } from "@/lib/doordashRestaurants.server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { BitesDoordashMenuItem } from "@/types/bitesDoordash";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export const runtime = "nodejs";

function mapManualMenuDoc(d: QueryDocumentSnapshot): {
  sortOrder: number;
  item: BitesDoordashMenuItem;
} {
  const x = d.data() as Record<string, unknown>;
  const priceRaw = x.price;
  const price =
    typeof priceRaw === "number" ? priceRaw : typeof priceRaw === "string" ? Number(priceRaw) || 0 : 0;
  const img =
    typeof x.photoUrl === "string"
      ? x.photoUrl
      : typeof x.imageUrl === "string"
        ? x.imageUrl
        : "";
  const calRaw = x.calories;
  const calories =
    calRaw == null || calRaw === ""
      ? 0
      : typeof calRaw === "number"
        ? calRaw
        : Number(calRaw) || 0;
  const item: BitesDoordashMenuItem = {
    id: d.id,
    name: String(x.name ?? ""),
    description: String(x.description ?? ""),
    price,
    category: String(x.category ?? "Menu"),
    imageUrl: img,
    isAvailable: x.available !== false && x.isAvailable !== false,
    calories,
    tags: Array.isArray(x.tags) ? (x.tags as string[]) : [],
    options: Array.isArray(x.options) ? (x.options as unknown[]) : [],
  };
  const sortOrder = typeof x.sortOrder === "number" ? x.sortOrder : Number(x.sortOrder) || 0;
  return { sortOrder, item };
}

function bearer(req: NextRequest) {
  const a = req.headers.get("authorization") ?? "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ businessId: string }> }) {
  if (!adminAuth) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }
  const token = bearer(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const { businessId } = await ctx.params;
  if (!businessId) {
    return NextResponse.json({ ok: false, error: "businessId required" }, { status: 400 });
  }

  const safeId = businessId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150) || "unknown";

  let cached: Record<string, unknown> | null = null;
  if (adminDb) {
    const meta = await adminDb.collection("restaurants").doc(safeId).get().catch(() => null);
    if (meta?.exists) cached = meta.data() ?? null;
  }

  if (adminDb && cached?.isManualEntry === true) {
    const rref = adminDb.collection("restaurants").doc(safeId);
    let ms = await rref.collection("menu").get().catch(() => null);
    if (!ms || ms.empty) {
      ms = await rref.collection("menuItems").get().catch(() => null);
    }
    const rows = ms?.docs.map((d) => mapManualMenuDoc(d)) ?? [];
    rows.sort((a, b) => a.sortOrder - b.sortOrder);
    const items = rows.map((r) => r.item);

    return NextResponse.json({ ok: true, items, count: items.length, cached, source: "manual" });
  }

  const items = await fetchBusinessMenuDoorDash(businessId);

  if (adminDb && items.length) {
    const safeR = safeId;
    for (const it of items) {
      await adminDb
        .collection("restaurants")
        .doc(safeR)
        .collection("menu")
        .doc(it.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150))
        .set(
          {
            ...it,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        .catch(() => null);
    }
  }

  return NextResponse.json({ ok: true, items, count: items.length, cached });
}
