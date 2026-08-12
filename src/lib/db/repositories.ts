import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type { RepoStatus, StudentRepository } from "@/lib/db/types";

export async function findRepository(
  assignmentId: string,
  userId: string,
): Promise<StudentRepository | null> {
  const { data, error } = await db()
    .from("student_repositories")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

/** Dipakai webhook: memetakan "org/repo" ke baris repository. */
export async function findRepositoryByFullName(
  fullName: string,
): Promise<StudentRepository | null> {
  const { data, error } = await db()
    .from("student_repositories")
    .select("*")
    .eq("full_name", fullName)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function listRepositoriesForAssignment(
  assignmentId: string,
): Promise<StudentRepository[]> {
  const { data, error } = await db()
    .from("student_repositories")
    .select("*")
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function listRepositoriesForUser(
  userId: string,
): Promise<StudentRepository[]> {
  const { data, error } = await db()
    .from("student_repositories")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Membuat/memperbarui catatan repository. Idempoten terhadap
 * (assignment_id, user_id) sehingga penyediaan ulang aman dijalankan.
 */
export async function upsertRepository(input: {
  assignmentId: string;
  userId: string;
  owner: string;
  name: string;
  fullName: string;
  githubRepoId?: number | null;
  htmlUrl?: string | null;
  defaultBranch?: string;
  status: RepoStatus;
  provisionError?: string | null;
}): Promise<StudentRepository> {
  return unwrap(
    await db()
      .from("student_repositories")
      .upsert(
        {
          assignment_id: input.assignmentId,
          user_id: input.userId,
          owner: input.owner,
          name: input.name,
          full_name: input.fullName,
          github_repo_id: input.githubRepoId ?? null,
          html_url: input.htmlUrl ?? null,
          default_branch: input.defaultBranch ?? "main",
          status: input.status,
          provision_error: input.provisionError ?? null,
          provisioned_at: input.status === "READY" ? new Date().toISOString() : null,
        },
        { onConflict: "assignment_id,user_id" },
      )
      .select("*")
      .single(),
  );
}
