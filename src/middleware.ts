import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth";

// Simple passcode gate for the pilot. Set ACCESS_CODE in the environment to turn it on.
export function middleware(req: NextRequest) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/enter") || pathname.startsWith("/api/enter")) return NextResponse.next();

  const cookie = req.cookies.get(ACCESS_COOKIE)?.value;
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Access code required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/enter";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
