import { NextResponse } from "next/server";
import { ACCESS_COOKIE, isValidCode } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const code = String(form.get("code") ?? "");
  const next = String(form.get("next") ?? "/");

  if (!isValidCode(code)) {
    return NextResponse.redirect(new URL(`/enter?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
  }

  const res = NextResponse.redirect(new URL(/^\/(?![\/\\])/.test(next) ? next : "/", req.url), 303);
  res.cookies.set(ACCESS_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
