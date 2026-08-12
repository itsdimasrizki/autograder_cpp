import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { findUserById } from "@/lib/db/users";
import type { User, UserRole } from "@/lib/db/types";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";

/**
 * Pengguna saat ini, atau null.
 *
 * Cookie hanya menyimpan users.id. Role selalu dibaca ulang dari database,
 * sehingga cookie yang dimanipulasi tidak dapat menaikkan hak akses.
 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const payload = verifySessionToken(
    jar.get(SESSION_COOKIE)?.value,
    env.sessionSecret,
  );
  if (!payload) return null;
  return findUserById(payload.uid);
}

/** Untuk halaman: mengarahkan ke /login kalau belum masuk. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Untuk halaman: memastikan role minimum, kalau tidak tampilkan 403. */
export async function requireRole(...roles: UserRole[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?error=forbidden");
  return user;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId, env.sessionSecret), {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
