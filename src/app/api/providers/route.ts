import { NextResponse } from "next/server";
import {
  listActiveProvidersTop3,
  listProvidersForServiceTop3,
  listProvidersNearZip,
} from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const service = url.searchParams.get("service");
  const zip = url.searchParams.get("zip") ?? undefined;

  let items;
  if (service) {
    items = await listProvidersForServiceTop3(service).catch(() => []);
  } else if (zip) {
    items = await listProvidersNearZip(zip).catch(() => []);
  } else {
    items = await listActiveProvidersTop3().catch(() => []);
  }
  return NextResponse.json({ ok: true, resource: "providers", items });
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Not implemented" },
    { status: 501 },
  );
}

