import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/auth/github-oauth";
import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  createOAuthState,
} from "@/lib/auth/session";
import { safePath } from "@/lib/actions/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Memulai alur "Login with GitHub".
 *
 * `?next=` dipakai saat mahasiswa membuka tautan undangan sebelum masuk,
 * supaya setelah login ia kembali ke halaman join dan bukan ke dasbor.
 * Nilainya dibatasi ke path internal lewat `safePath` agar tidak menjadi
 * open redirect.
 */
export async function GET(request: NextRequest) {
  const state = createOAuthState();
  const next = safePath(
    request.nextUrl.searchParams.get("next") ?? "",
    "/dashboard",
  );

  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      clientId: env.githubOAuthClientId,
      redirectUri: `${env.appUrl}/api/auth/github/callback`,
      state,
    }),
  );

  const cookieOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };

  // State disimpan di cookie httpOnly berumur pendek untuk mencegah CSRF.
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_RETURN_COOKIE, next, cookieOptions);

  return response;
}
