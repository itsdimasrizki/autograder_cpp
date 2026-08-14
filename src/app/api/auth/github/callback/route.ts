import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  exchangeCodeForToken,
  fetchGitHubProfile,
} from "@/lib/auth/github-oauth";
import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifyOAuthState,
} from "@/lib/auth/session";
import { safePath } from "@/lib/actions/result";
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

  // GitHub mengirim ini bila pengguna menekan "Cancel" pada layar otorisasi.
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return loginError(
      oauthError === "access_denied" ? "otorisasi_dibatalkan" : "login_gagal",
    );
  }

  if (!verifyOAuthState(state, cookieState)) {
    return loginError("state_tidak_valid");
  }
  if (!code) {
    return loginError("code_tidak_ada");
  }

  // Tahapan dipisah supaya pesan yang dilihat pengguna menunjuk langkah yang
  // benar-benar gagal. Sebelumnya semua kegagalan menjadi "login_gagal" saja,
  // sehingga masalah nyata (mis. bentrok data pengguna) tidak pernah terlihat.
  let user;
  try {
    const accessToken = await exchangeCodeForToken({
      clientId: env.githubOAuthClientId,
      clientSecret: env.githubOAuthClientSecret,
      code,
      redirectUri: `${env.appUrl}/api/auth/github/callback`,
    });

    let profile;
    try {
      profile = await fetchGitHubProfile(accessToken);
    } catch (error) {
      console.error("[auth] gagal membaca profil GitHub:", error);
      return loginError("profil_gagal");
    }

    try {
      user = await upsertUserFromGitHub(profile);
    } catch (error) {
      console.error(
        `[auth] gagal menyimpan pengguna @${profile.githubLogin} (id ${profile.githubUserId}):`,
        error,
      );
      return loginError("penyimpanan_gagal");
    }
  } catch (error) {
    console.error("[auth] penukaran code OAuth gagal:", error);
    return loginError("login_gagal");
  }

  // Kembali ke halaman yang diminta sebelum login (mis. /join/<token>).
  const returnTo = safePath(
    request.cookies.get(OAUTH_RETURN_COOKIE)?.value ?? "",
    "/dashboard",
  );

  const response = NextResponse.redirect(`${env.appUrl}${returnTo}`);
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
  response.cookies.delete(OAUTH_RETURN_COOKIE);
  return response;
}
