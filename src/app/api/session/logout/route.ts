import { NextResponse } from "next/server";

const secure = process.env.NODE_ENV === "production";

function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

export async function POST() {
  const res = NextResponse.json({ ok: true });

  clearCookie(res, "gridd_uid");
  clearCookie(res, "gridd_role");
  clearCookie(res, "gridd_agreements_ok");

  res.cookies.set("gridd-session", "", { path: "/", maxAge: 0 });
  res.cookies.set("gridd-role", "", { path: "/", maxAge: 0 });
  res.cookies.set("gridd-agreements-ok", "", { path: "/", maxAge: 0 });

  return res;
}
