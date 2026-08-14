import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type {
  Assignment,
  AssignmentTemplate,
  ScoringMode,
} from "@/lib/db/types";

/**
 * Tugas milik sebuah mata kuliah.
 *
 * Tugas yang diarsipkan disembunyikan secara default supaya tidak muncul di
 * dasbor mahasiswa maupun daftar kelas, tetapi barisnya — beserta seluruh
 * submission dan nilainya — tetap ada di database.
 */
export async function listAssignments(
  courseId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Assignment[]> {
  let query = db()
    .from("assignments")
    .select("*")
    .eq("course_id", courseId)
    .order("meeting_number");

  if (!options.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const { data, error } = await db()
    .from("assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export interface AssignmentInput {
  courseId: string;
  meetingNumber: number;
  title: string;
  description: string | null;
  templateId: string | null;
  maxScore: number;
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
}

export async function createAssignment(
  input: AssignmentInput,
): Promise<Assignment> {
  return unwrap(
    await db()
      .from("assignments")
      .insert({
        course_id: input.courseId,
        meeting_number: input.meetingNumber,
        title: input.title,
        description: input.description,
        template_id: input.templateId,
        max_score: input.maxScore,
        deadline: input.deadline,
        max_attempts: input.maxAttempts,
        scoring_mode: input.scoringMode,
        published: false,
      })
      .select("*")
      .single(),
  );
}

export async function updateAssignment(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    template_id: string | null;
    max_score: number;
    deadline: string | null;
    max_attempts: number | null;
    scoring_mode: ScoringMode;
    published: boolean;
    archived_at: string | null;
  }>,
): Promise<void> {
  const { error } = await db().from("assignments").update(patch).eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Berapa banyak jejak yang sudah dimiliki tugas ini.
 *
 * Dipakai untuk memutuskan antara hapus permanen (belum ada jejak apa pun)
 * dan arsip (sudah ada repository/submission yang tidak boleh hilang).
 */
export async function countAssignmentFootprint(
  assignmentId: string,
): Promise<{ submissions: number; repositories: number }> {
  const client = db();

  const [submissions, repositories] = await Promise.all([
    client
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", assignmentId),
    client
      .from("student_repositories")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", assignmentId),
  ]);

  if (submissions.error) {
    throw new Error(`Supabase: ${submissions.error.message}`);
  }
  if (repositories.error) {
    throw new Error(`Supabase: ${repositories.error.message}`);
  }

  return {
    submissions: submissions.count ?? 0,
    repositories: repositories.count ?? 0,
  };
}

/** Menandai tugas sebagai diarsipkan. Data submission tidak disentuh. */
export async function archiveAssignment(id: string): Promise<void> {
  await updateAssignment(id, {
    archived_at: new Date().toISOString(),
    published: false,
  });
}

export async function restoreAssignment(id: string): Promise<void> {
  await updateAssignment(id, { archived_at: null });
}

/**
 * Hapus permanen. Hanya dipanggil setelah countAssignmentFootprint memastikan
 * tugas ini belum punya repository maupun submission.
 */
export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await db().from("assignments").delete().eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Template repository
// -----------------------------------------------------------------------------

export async function listTemplates(
  options: { includeArchived?: boolean } = {},
): Promise<AssignmentTemplate[]> {
  let query = db().from("assignment_templates").select("*").order("name");
  if (!options.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getTemplate(
  id: string,
): Promise<AssignmentTemplate | null> {
  const { data, error } = await db()
    .from("assignment_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function createTemplate(input: {
  name: string;
  owner: string;
  repo: string;
  description: string | null;
}): Promise<AssignmentTemplate> {
  const client = db();

  const existing = await client
    .from("assignment_templates")
    .select("*")
    .eq("owner", input.owner)
    .eq("repo", input.repo)
    .maybeSingle();
  if (existing.error) throw new Error(`Supabase: ${existing.error.message}`);
  if (existing.data) return existing.data;

  return unwrap(
    await client
      .from("assignment_templates")
      .insert({
        name: input.name,
        owner: input.owner,
        repo: input.repo,
        description: input.description,
      })
      .select("*")
      .single(),
  );
}

/** Hanya metadata yang boleh disunting; owner/repo menentukan identitas template. */
export async function updateTemplate(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    archived_at: string | null;
  }>,
): Promise<void> {
  const { error } = await db()
    .from("assignment_templates")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Tugas yang masih memakai template ini.
 *
 * Menghapus template yang masih dipakai akan memutus rujukan tugas tersebut
 * (kolomnya `on delete set null`), sehingga penyediaan repository berikutnya
 * gagal tanpa penjelasan. Karena itu pemanggil wajib memeriksa daftar ini
 * lebih dulu dan menolak penghapusan dengan alasan yang jelas.
 */
export async function listAssignmentsUsingTemplate(
  templateId: string,
): Promise<Array<Pick<Assignment, "id" | "title" | "meeting_number">>> {
  const { data, error } = await db()
    .from("assignments")
    .select("id, title, meeting_number")
    .eq("template_id", templateId)
    .is("archived_at", null)
    .order("meeting_number");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Menghapus catatan template dari aplikasi.
 *
 * Repository GitHub fisiknya TIDAK disentuh sama sekali — penghapusan di sini
 * hanya memutus pendaftaran template pada aplikasi.
 */
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await db()
    .from("assignment_templates")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
}
