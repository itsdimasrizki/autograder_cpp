import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Token tautan undangan kelas.
 *
 * Modul ini sengaja murni (tidak menyentuh database maupun next/headers)
 * supaya bisa diuji langsung, sama seperti src/lib/auth/policy.ts.
 *
 * Prinsip keamanan:
 *   - Token adalah 32 byte acak kriptografis, BUKAN UUID kelas. UUID kelas
 *     dapat ditebak/terlihat di URL halaman lain, jadi tidak boleh dipakai
 *     sebagai bukti hak masuk kelas.
 *   - Yang disimpan di database hanya SHA-256 token. Bocornya isi tabel tidak
 *     membuat siapa pun bisa bergabung.
 *   - class_id TIDAK PERNAH diambil dari browser saat join; selalu diturunkan
 *     dari baris yang cocok dengan hash token. Mengubah token menjadi token
 *     kelas lain karena itu mustahil tanpa mengetahui token kelas tersebut.
 */

/** Panjang token dalam byte sebelum dikodekan base64url. */
const TOKEN_BYTES = 32;

/** Bentuk token yang valid setelah base64url: 43 karakter untuk 32 byte. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateJoinToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Menolak token yang bentuknya jelas salah sebelum menyentuh database.
 * Mencegah pencarian sia-sia dan input aneh (mis. UUID kelas) masuk lebih jauh.
 */
export function isWellFormedJoinToken(token: string | null | undefined): boolean {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function hashJoinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Perbandingan hash yang aman terhadap timing attack. */
export function joinTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashJoinToken(token));
  const expected = Buffer.from(expectedHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export interface JoinLinkState {
  revoked_at: string | null;
  expires_at: string | null;
}

export type JoinLinkStatus = "AKTIF" | "DICABUT" | "KEDALUWARSA";

export function joinLinkStatus(
  link: JoinLinkState,
  now: Date = new Date(),
): JoinLinkStatus {
  if (link.revoked_at) return "DICABUT";
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) {
    return "KEDALUWARSA";
  }
  return "AKTIF";
}

/** Hanya tautan yang belum dicabut dan belum kedaluwarsa yang boleh dipakai. */
export function isJoinLinkUsable(
  link: JoinLinkState,
  now: Date = new Date(),
): boolean {
  return joinLinkStatus(link, now) === "AKTIF";
}

export function buildJoinUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/join/${token}`;
}
