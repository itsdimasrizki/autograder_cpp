import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type { User, UserRole } from "@/lib/db/types";
import type { GitHubProfile } from "@/lib/auth/github-oauth";
import { env } from "@/lib/env";

/**
 * Membuat/memperbarui baris user dari profil GitHub saat login.
 *
 * IDENTITAS UTAMA adalah `github_user_id` (angka, tidak pernah berubah), bukan
 * username. Username GitHub bisa diganti pemiliknya kapan saja dan bekas
 * username bisa dipakai orang lain, jadi username tidak pernah dipakai untuk
 * mencocokkan akun. Ini juga yang mencegah akun ganda saat mahasiswa mengganti
 * username-nya.
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

  // Username yang hendak dipakai mungkin masih tercatat pada baris LAIN yang
  // datanya sudah basi (pemilik lama mengganti username, lalu username itu
  // diambil orang ini). Baris basi itu disegarkan lebih dulu supaya daftar
  // pengguna tidak menampilkan dua akun dengan username sama.
  await releaseStaleLogin(profile.githubLogin, profile.githubUserId);

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

/**
 * Menandai baris lain yang masih memegang `login` sebagai basi.
 *
 * GitHub menjamin satu username hanya dimiliki satu akun pada satu waktu, jadi
 * kalau baris lain (github_user_id berbeda) masih memakai username ini, data
 * baris tersebut sudah usang. Username-nya diberi penanda agar tidak bentrok,
 * sementara github_user_id — identitas sebenarnya — tetap utuh sehingga
 * keanggotaan kelas dan histori nilainya tidak hilang.
 */
async function releaseStaleLogin(
  login: string,
  keepGitHubUserId: number,
): Promise<void> {
  const client = db();

  const { data, error } = await client
    .from("users")
    .select("id, github_user_id, github_login")
    .ilike("github_login", login)
    .neq("github_user_id", keepGitHubUserId);
  if (error) throw new Error(`Supabase: ${error.message}`);

  for (const row of data ?? []) {
    const { error: updateError } = await client
      .from("users")
      .update({ github_login: `${row.github_login}#${row.github_user_id}` })
      .eq("id", row.id);
    if (updateError) throw new Error(`Supabase: ${updateError.message}`);
  }
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

/**
 * Pencarian berdasarkan username GitHub.
 *
 * Username tidak unik di database (lihat migrasi 0002), jadi hasil dibatasi
 * satu baris paling baru dan pemanggil harus sadar ini hanya untuk kenyamanan
 * pencarian — bukan untuk menentukan identitas.
 */
export async function findUserByGitHubLogin(
  login: string,
): Promise<User | null> {
  const { data, error } = await db()
    .from("users")
    .select("*")
    .ilike("github_login", login)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data?.[0] ?? null;
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

/** Jejak audit perubahan role. Kegagalan menulis audit tidak boleh senyap. */
export async function logRoleChange(params: {
  actorUserId: string;
  targetUserId: string;
  fromRole: UserRole;
  toRole: UserRole;
}): Promise<void> {
  const { error } = await db().from("role_change_log").insert({
    actor_user_id: params.actorUserId,
    target_user_id: params.targetUserId,
    from_role: params.fromRole,
    to_role: params.toRole,
  });
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Daftar pengguna, opsional disaring berdasarkan role.
 *
 * Penyaringan dilakukan di database (bukan di browser) supaya halaman /users
 * tidak pernah mengirim baris yang tidak diminta.
 */
export async function listUsers(
  options: { role?: UserRole; limit?: number } = {},
): Promise<User[]> {
  let query = db()
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 500);

  if (options.role) query = query.eq("role", options.role);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Menghapus permanen sebuah akun.
 *
 * PERINGATAN: foreign key pada skema memakai ON DELETE CASCADE, sehingga
 * keanggotaan kelas, student_repositories, dan submissions milik pengguna ini
 * ikut terhapus. Repository di GitHub sendiri tidak disentuh.
 *
 * Pemanggil WAJIB memeriksa `canDeleteUser` lebih dulu.
 */
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await db().from("users").delete().eq("id", userId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/** Apa saja yang akan ikut hilang bila akun ini dihapus. */
export async function countUserFootprint(
  userId: string,
): Promise<{ submissions: number; repositories: number }> {
  const client = db();

  const [submissions, repositories] = await Promise.all([
    client
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    client
      .from("student_repositories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (submissions.error) throw new Error(`Supabase: ${submissions.error.message}`);
  if (repositories.error) {
    throw new Error(`Supabase: ${repositories.error.message}`);
  }

  return {
    submissions: submissions.count ?? 0,
    repositories: repositories.count ?? 0,
  };
}

/**
 * Jumlah submission per pengguna dalam satu query, untuk menampilkan angka
 * pada dialog konfirmasi tanpa menembak query per baris tabel.
 */
export async function countSubmissionsByUser(): Promise<Record<string, number>> {
  const { data, error } = await db().from("submissions").select("user_id");
  if (error) throw new Error(`Supabase: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
  }
  return counts;
}

/** Jumlah pengguna per role, untuk angka pada tab filter. */
export async function countUsersByRole(): Promise<Record<UserRole, number>> {
  const { data, error } = await db().from("users").select("role");
  if (error) throw new Error(`Supabase: ${error.message}`);

  const counts: Record<UserRole, number> = {
    SUPER_ADMIN: 0,
    ASSISTANT: 0,
    STUDENT: 0,
  };
  for (const row of data ?? []) counts[row.role] += 1;
  return counts;
}
