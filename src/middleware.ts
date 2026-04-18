import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Auth and role checks run client-side to avoid redirect loops and flicker on mobile. */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
