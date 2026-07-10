import { NextResponse } from "next/server";
import { verifyBearerDecoded } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

/** Search users by name prefix for starting a DM (auth required, capped). */
export async function GET(req: Request) {
  const decoded = await verifyBearerDecoded(req);
  if (!decoded?.uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) {
    return NextResponse.json({
      ok: true,
      results: [] as { uid: string; name: string; photo: string | null; role: "customer" | "driver" }[],
    });
  }

  const me = decoded.uid;
  const out: { uid: string; name: string; photo: string | null; role: "customer" | "driver" }[] = [];

  if (q.includes("@")) {
    try {
      const emailLower = q.trim().toLowerCase();
      const uEmail = await adminDb.collection("users").where("email", "==", emailLower).limit(10).get();
      uEmail.docs.forEach((d) => {
        if (d.id === me) return;
        const data = d.data() as { name?: string; blocked?: boolean; photoURL?: string };
        if (data.blocked === true) return;
        out.push({
          uid: d.id,
          name: data.name ?? "User",
          photo: data.photoURL ?? null,
          role: "customer",
        });
      });
      const pEmail = await adminDb.collection("providers").where("email", "==", emailLower).limit(10).get();
      pEmail.docs.forEach((d) => {
        if (d.id === me) return;
        if (out.some((x) => x.uid === d.id)) return;
        const data = d.data() as { name?: string; blocked?: boolean; photoUrl?: string };
        if (data.blocked === true) return;
        out.push({
          uid: d.id,
          name: data.name ?? "Driver",
          photo: data.photoUrl ?? null,
          role: "driver",
        });
      });
    } catch {
      /* index */
    }
    return NextResponse.json({ ok: true, results: out.slice(0, 20) });
  }

  try {
    const uSnap = await adminDb
      .collection("users")
      .where("name", ">=", q)
      .where("name", "<=", `${q}\uf8ff`)
      .limit(15)
      .get();

    uSnap.docs.forEach((d) => {
      if (d.id === me) return;
      const data = d.data() as { name?: string; blocked?: boolean; photoURL?: string };
      if (data.blocked === true) return;
      out.push({
        uid: d.id,
        name: data.name ?? "User",
        photo: data.photoURL ?? null,
        role: "customer",
      });
    });
  } catch {
    /* index or field missing — skip */
  }

  try {
    const pSnap = await adminDb
      .collection("providers")
      .where("name", ">=", q)
      .where("name", "<=", `${q}\uf8ff`)
      .limit(15)
      .get();

    pSnap.docs.forEach((d) => {
      if (d.id === me) return;
      if (out.some((x) => x.uid === d.id)) return;
      const data = d.data() as { name?: string; blocked?: boolean; photoUrl?: string };
      if (data.blocked === true) return;
      out.push({
        uid: d.id,
        name: data.name ?? "Driver",
        photo: data.photoUrl ?? null,
        role: "driver",
      });
    });
  } catch {
    /* index or field missing */
  }

  return NextResponse.json({ ok: true, results: out.slice(0, 20) });
}
