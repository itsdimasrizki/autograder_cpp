import "server-only";

import { db } from "@/lib/db/client";
import type { AssignmentClassSettings, ScoringMode } from "@/lib/db/types";

/**
 * Setelan tugas per kelas.
 *
 * Berkas ini hanya melakukan I/O; keputusan "kelas ini ikut nilai dasar atau
 * tidak" ada di resolveAssignmentConfig (src/lib/grading/config.ts), yang murni
 * dan teruji. Di sini, ADA baris berarti kelas sudah disesuaikan.
 */

export async function getClassSettings(
  assignmentId: string,
  classId: string,
): Promise<AssignmentClassSettings | null> {
  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

/** Seluruh kelas yang setelannya sudah disesuaikan pada sebuah tugas. */
export async function listClassSettings(
  assignmentId: string,
): Promise<AssignmentClassSettings[]> {
  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Setelan untuk banyak tugas sekaligus pada kelas-kelas tertentu.
 *
 * Dipakai dasbor mahasiswa dan daftar tugas: satu query untuk seluruh
 * pertemuan, supaya tidak menjadi N+1.
 */
export async function listClassSettingsForAssignments(
  assignmentIds: string[],
  classIds: string[],
): Promise<AssignmentClassSettings[]> {
  if (assignmentIds.length === 0 || classIds.length === 0) return [];

  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .in("assignment_id", assignmentIds)
    .in("class_id", classIds);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Seluruh setelan kelas untuk sekumpulan tugas, tanpa menyaring kelas.
 *
 * Dipakai staf pada daftar tugas untuk menandai pertemuan yang tenggatnya
 * sudah berbeda-beda antar kelas, sehingga satu angka tenggat tidak tampil
 * seolah berlaku untuk semua.
 */
export async function listClassSettingsByAssignments(
  assignmentIds: string[],
): Promise<AssignmentClassSettings[]> {
  if (assignmentIds.length === 0) return [];

  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .in("assignment_id", assignmentIds);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function upsertClassSettings(input: {
  assignmentId: string;
  classId: string;
  courseId: string;
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
  updatedBy: string;
}): Promise<void> {
  const { error } = await db()
    .from("assignment_class_settings")
    .upsert(
      {
        assignment_id: input.assignmentId,
        class_id: input.classId,
        course_id: input.courseId,
        deadline: input.deadline,
        max_attempts: input.maxAttempts,
        scoring_mode: input.scoringMode,
        updated_by: input.updatedBy,
      },
      { onConflict: "assignment_id,class_id" },
    );
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/** Mengembalikan satu kelas ke nilai dasar. */
export async function deleteClassSettings(
  assignmentId: string,
  classId: string,
): Promise<void> {
  const { error } = await db()
    .from("assignment_class_settings")
    .delete()
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Mengembalikan SELURUH kelas ke nilai dasar.
 *
 * Dipakai tombol "Simpan dan terapkan ke semua kelas" milik admin. Tidak ada
 * nilai yang hilang: yang dihapus hanya setelan, sedangkan submission dan
 * riwayatnya tidak disentuh.
 */
export async function deleteAllClassSettings(
  assignmentId: string,
): Promise<void> {
  const { error } = await db()
    .from("assignment_class_settings")
    .delete()
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/** Berapa kelas yang setelannya akan hilang bila diterapkan ke semua kelas. */
export async function countClassSettings(
  assignmentId: string,
): Promise<number> {
  const { count, error } = await db()
    .from("assignment_class_settings")
    .select("assignment_id", { count: "exact", head: true })
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return count ?? 0;
}
