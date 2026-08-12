import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Token sesi yang ditandatangani (HMAC-SHA256).
 *
 * Modul ini sengaja murni (tidak menyentuh next/headers) supaya mudah diuji.
 *
 * PENTING: payload TIDAK memuat role. Role selalu dibaca ulang dari database
 * pada setiap request, sehingga browser tidak akan pernah bisa mengangkat
 * dirinya sendiri menjadi admin walaupun cookie dimanipulasi.
 */
export interface SessionPayload {
  /** users.id */
  uid: string;
  /** Unix epoch detik saat token dibuat. */
  iat: number;
  /** Unix epoch detik masa berlaku. */
  exp: number;
}

export const SESSION_COOKIE = "strukdat_session";
export const OAUTH_STATE_COOKIE = "strukdat_oauth_state";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  uid: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const payload: SessionPayload = { uid, iat: now, exp: now + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Mengembalikan payload kalau tanda tangan valid dan belum kedaluwarsa,
 * selain itu null. Tidak pernah melempar error untuk input yang rusak.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(body, secret);

  // Perbandingan waktu-konstan; panjang berbeda otomatis ditolak.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload?.uid !== "string" ||
    typeof payload?.exp !== "number" ||
    payload.uid.length === 0
  ) {
    return null;
  }
  if (payload.exp <= now) return null;

  return payload;
}

/** State acak untuk mencegah CSRF pada alur OAuth. */
export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** Perbandingan state OAuth yang aman terhadap timing attack. */
export function verifyOAuthState(
  fromQuery: string | null | undefined,
  fromCookie: string | null | undefined,
): boolean {
  if (!fromQuery || !fromCookie) return false;
  const a = Buffer.from(fromQuery);
  const b = Buffer.from(fromCookie);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
