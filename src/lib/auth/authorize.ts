import "server-only";

import { getCurrentUser } from "@/lib/auth/current-user";
import { listMembershipsOf } from "@/lib/db/courses";
import {
  AuthorizationError,
  type AccessContext,
  type Membership,
} from "@/lib/auth/policy";
import type { User } from "@/lib/db/types";

/**
 * Memuat konteks otorisasi (user + seluruh keanggotaan kelas) dari database.
 *
 * Semua server action dan halaman memanggil ini lebih dulu, lalu memakai
 * predikat murni di src/lib/auth/policy.ts untuk memutuskan akses.
 */
export async function loadAccessContext(user: User): Promise<AccessContext> {
  const memberships = await listMembershipsOf(user.id);
  return { user: { id: user.id, role: user.role }, memberships };
}

/** Untuk server action / route handler: melempar error kalau belum login. */
export async function requireAccessContext(): Promise<
  AccessContext & { user: User & AccessContext["user"] }
> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Anda belum masuk.");
  const memberships = await listMembershipsOf(user.id);
  return { user: { ...user }, memberships };
}

export async function membershipsOf(userId: string): Promise<Membership[]> {
  return listMembershipsOf(userId);
}
