import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type { User, UserRole } from "@/lib/db/types";
import type { GitHubProfile } from "@/lib/auth/github-oauth";
import { env } from "@/lib/env";

/**
 * Membuat/memperbarui baris user dari profil GitHub saat login.
 *
 * Role TIDAK pernah diambil dari input pengguna:
 *   - user baru default STUDENT,
 *   - kecuali username-nya terdaftar di env GITHUB_SUPER_ADMINS,
 *   - user lama mempertahankan role yang sudah tersimpan di database.
 */
export async function upsertUserFromGitHub(
  profile: GitHubProfile,
): Promise<User> {
  const client = db();
  const isBootstrapAdmin = env.superAdmins.includes(
    profile.githubLogin.toLowerCase(),
  );

  const existing = await client
    .from("users")
    .select("*")
    .eq("github_user_id", profile.githubUserId)
    .maybeSingle();

  if (existing.error) throw new Error(`Supabase: ${existing.error.message}`);

  if (existing.data) {
    const current = existing.data;
    const nextRole: UserRole =
      isBootstrapAdmin && current.role !== "SUPER_ADMIN"
        ? "SUPER_ADMIN"
        : current.role;

    return unwrap(
      await client
        .from("users")
        .update({
          github_login: profile.githubLogin,
          display_name: profile.displayName,
          avatar_url: profile.avatarUrl,
          email: profile.email ?? current.email,
          role: nextRole,
        })
        .eq("id", current.id)
        .select("*")
        .single(),
    );
  }

  return unwrap(
    await client
      .from("users")
      .insert({
        github_user_id: profile.githubUserId,
        github_login: profile.githubLogin,
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl,
        email: profile.email,
        role: isBootstrapAdmin ? "SUPER_ADMIN" : "STUDENT",
      })
      .select("*")
      .single(),
  );
}

export async function findUserById(id: string): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function findUserByGitHubLogin(
  login: string,
): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .ilike("github_login", login)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

/**
 * Membuat baris user "belum pernah login" saat asisten menambahkan mahasiswa
 * lewat username GitHub. Identitas GitHub diverifikasi lebih dulu ke API
 * GitHub sehingga github_user_id selalu asli.
 */
export async function ensureStudentUser(profile: {
  githubUserId: number;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
}): Promise<User> {
  const client = db();

  const existing = await client
    .from("users")
    .select("*")
    .eq("github_user_id", profile.githubUserId)
    .maybeSingle();
  if (existing.error) throw new Error(`Supabase: ${existing.error.message}`);
  if (existing.data) return existing.data;

  return unwrap(
    await client
      .from("users")
      .insert({
        github_user_id: profile.githubUserId,
        github_login: profile.githubLogin,
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl,
        role: "STUDENT",
      })
      .select("*")
      .single(),
  );
}

/** Perubahan role hanya boleh dipanggil dari server action milik SUPER_ADMIN. */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  const { error } = await db().from("users").update({ role }).eq("id", userId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

export async function listUsers(limit = 200): Promise<User[]> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}
