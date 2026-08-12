import "server-only";

import { createSign, createPrivateKey } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Autentikasi GitHub App.
 *
 * Semua operasi repository memakai installation access token milik App,
 * bukan token pribadi pengguna dan bukan Personal Access Token.
 */

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * JWT App (RS256), berlaku maksimal 10 menit.
 *
 * GitHub membagikan private key dalam format PKCS#1 ("BEGIN RSA PRIVATE KEY").
 * createPrivateKey menerima PKCS#1 maupun PKCS#8, jadi keduanya aman dipakai.
 */
export function createAppJwt(
  appId: string,
  privateKeyPem: string,
  now: number = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      // Mundur 60 detik untuk menoleransi selisih jam server.
      iat: now - 60,
      exp: now + 540,
      iss: appId,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();

  const signature = signer
    .sign(createPrivateKey(privateKeyPem))
    .toString("base64url");

  return `${header}.${payload}.${signature}`;
}

// Cache per-instance lambda. Bukan state aplikasi yang menentukan kebenaran:
// kalau instance baru dibuat, token tinggal diminta ulang.
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getInstallationToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

  const jwt = createAppJwt(env.githubAppId, env.githubAppPrivateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${env.githubAppInstallationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "web-strukdat",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gagal mengambil installation token GitHub App (HTTP ${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };
  return data.token;
}

/** Dipakai di test/dev untuk membersihkan cache token. */
export function resetInstallationTokenCache(): void {
  cachedToken = null;
}
