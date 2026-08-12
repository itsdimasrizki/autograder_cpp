/**
 * Alur GitHub OAuth (authorization code).
 *
 * Hanya identitas yang diambil di sini. Semua operasi repository memakai
 * kredensial GitHub App (lihat src/lib/github/), bukan token milik pengguna.
 */

export interface GitHubProfile {
  githubUserId: number;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

/** Scope minimal: hanya butuh identitas dasar + email. */
export const OAUTH_SCOPE = "read:user user:email";

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", OAUTH_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

/** Menukar authorization code dengan access token pengguna. */
export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Gagal menukar code OAuth (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `GitHub menolak code OAuth: ${data.error_description ?? data.error ?? "tidak diketahui"}`,
    );
  }
  return data.access_token;
}

/**
 * Menormalkan payload /user dari GitHub menjadi bentuk internal.
 * Dipisah agar bisa diuji tanpa memanggil jaringan.
 */
export function normalizeProfile(
  user: Record<string, unknown>,
  fallbackEmail: string | null = null,
): GitHubProfile {
  const id = user.id;
  const login = user.login;

  if (typeof id !== "number" || typeof login !== "string" || !login) {
    throw new Error("Respons profil GitHub tidak valid.");
  }

  return {
    githubUserId: id,
    githubLogin: login,
    displayName: typeof user.name === "string" && user.name ? user.name : null,
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
    email:
      typeof user.email === "string" && user.email ? user.email : fallbackEmail,
  };
}

/** Memilih email utama yang terverifikasi dari /user/emails. */
export function pickPrimaryEmail(
  emails: Array<{ email?: string; primary?: boolean; verified?: boolean }>,
): string | null {
  const primary = emails.find((e) => e.primary && e.verified && e.email);
  if (primary?.email) return primary.email;
  const verified = emails.find((e) => e.verified && e.email);
  return verified?.email ?? null;
}

export async function fetchGitHubProfile(
  accessToken: string,
): Promise<GitHubProfile> {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "web-strukdat",
  };

  const userResponse = await fetch("https://api.github.com/user", {
    headers,
    cache: "no-store",
  });
  if (!userResponse.ok) {
    throw new Error(`Gagal membaca profil GitHub (HTTP ${userResponse.status}).`);
  }
  const user = (await userResponse.json()) as Record<string, unknown>;

  // Email bisa disembunyikan di profil publik; coba endpoint khusus email.
  let email: string | null = null;
  const emailResponse = await fetch("https://api.github.com/user/emails", {
    headers,
    cache: "no-store",
  });
  if (emailResponse.ok) {
    email = pickPrimaryEmail(
      (await emailResponse.json()) as Array<Record<string, never>>,
    );
  }

  return normalizeProfile(user, email);
}
