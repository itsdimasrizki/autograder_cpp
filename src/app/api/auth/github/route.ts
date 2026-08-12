import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/auth/github-oauth";
import { OAUTH_STATE_COOKIE, createOAuthState } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Memulai alur "Login with GitHub". */
export async function GET() {
  const state = createOAuthState();

  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      clientId: env.githubOAuthClientId,
      redirectUri: `${env.appUrl}/api/auth/github/callback`,
      state,
    }),
  );

  // State disimpan di cookie httpOnly berumur pendek untuk mencegah CSRF.
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
