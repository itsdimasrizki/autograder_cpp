import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST supaya tidak bisa dipicu lewat <img>/prefetch. */
export async function POST() {
  const response = NextResponse.redirect(`${env.appUrl}/login`, {
    status: 303,
  });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
