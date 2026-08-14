import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type { ClassJoinLink } from "@/lib/db/types";
import { hashJoinToken } from "@/lib/auth/join-token";

/**
 * Tautan undangan kelas.
 *
 * Token asli tidak pernah disimpan — hanya hash-nya. Pencarian dilakukan
 * berdasarkan hash sehingga class_id selalu ditentukan server, bukan browser.
 */

/** Tautan aktif (belum dicabut) milik sebuah kelas, kalau ada. */
export async function getActiveJoinLink(
  classId: string,
): Promise<ClassJoinLink | null> {
  const { data, error } = await db()
    .from("class_join_links")
    .select("*")
    .eq("class_id", classId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

/**
 * Membuat tautan baru sekaligus mencabut tautan lama kelas tersebut.
 *
 * Inilah yang membuat "Regenerate" otomatis membatalkan tautan sebelumnya:
 * indeks unik parsial di migrasi 0002 hanya mengizinkan satu baris aktif.
 */
export async function createJoinLink(params: {
  classId: string;
  courseId: string;
  token: string;
  createdBy: string;
  expiresAt: string | null;
}): Promise<ClassJoinLink> {
  await revokeJoinLinksOfClass(params.classId, params.createdBy);

  return unwrap(
    await db()
      .from("class_join_links")
      .insert({
        class_id: params.classId,
        course_id: params.courseId,
        token_hash: hashJoinToken(params.token),
        created_by: params.createdBy,
        expires_at: params.expiresAt,
      })
      .select("*")
      .single(),
  );
}

export async function revokeJoinLinksOfClass(
  classId: string,
  revokedBy: string,
): Promise<void> {
  const { error } = await db()
    .from("class_join_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("class_id", classId)
    .is("revoked_at", null);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Mencari tautan berdasarkan token mentah dari URL.
 *
 * Yang dikirim ke database adalah hash, bukan token. Baris yang cocok
 * menentukan kelas mana yang akan dimasuki — browser tidak pernah menyebut
 * class_id, sehingga token satu kelas tidak bisa dipakai masuk kelas lain.
 */
export async function findJoinLinkByToken(
  token: string,
): Promise<ClassJoinLink | null> {
  const { data, error } = await db()
    .from("class_join_links")
    .select("*")
    .eq("token_hash", hashJoinToken(token))
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}
