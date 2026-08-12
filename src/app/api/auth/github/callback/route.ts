import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  exchangeCodeForToken,
  fetchGitHubProfile,
} from "@/lib/auth/github-oauth";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifyOAuthState,
} from "@/lib/auth/session";
import { upsertUserFromGitHub } from "@/lib/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginError(reason: string) {
  return NextResponse.redirect(
    `${env.appUrl}/login?error=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!verifyOAuthState(state, cookieState)) {
    return loginError("state_tidak_valid");
  }
  if (!code) {
    return loginError("code_tidak_ada");
  }

  let user;
  try {
    const accessToken = await exchangeCodeForToken({
      clientId: env.githubOAuthClientId,
      clientSecret: env.githubOAuthClientSecret,
      code,
      redirectUri: `${env.appUrl}/api/auth/github/callback`,
    });
    const profile = await fetchGitHubProfile(accessToken);
    user = await upsertUserFromGitHub(profile);
  } catch (error) {
    console.error("[auth] login gagal:", error);
    return loginError("login_gagal");
  }

  const response = NextResponse.redirect(`${env.appUrl}/dashboard`);
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id, env.sessionSecret),
    {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
