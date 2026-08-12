import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type { Submission, TestResult } from "@/lib/db/types";
import type {
  SubmissionRecord,
  SubmissionStore,
  TestResultRecord,
} from "@/lib/grading/ingest";

/** Kode error Postgres untuk pelanggaran unique constraint. */
const UNIQUE_VIOLATION = "23505";

/** Implementasi SubmissionStore di atas Supabase. */
export const submissionStore: SubmissionStore = {
  async findSubmission(studentRepositoryId, workflowRunId, runAttempt) {
    const { data, error } = await db()
      .from("submissions")
      .select("*")
      .eq("student_repository_id", studentRepositoryId)
      .eq("workflow_run_id", workflowRunId)
      .eq("run_attempt", runAttempt)
      .maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data;
  },

  async insertSubmission(record: SubmissionRecord) {
    const { data, error } = await db()
      .from("submissions")
      .insert({
        assignment_id: record.assignmentId,
        user_id: record.userId,
        student_repository_id: record.studentRepositoryId,
        commit_sha: record.commitSha,
        workflow_run_id: record.workflowRunId,
        run_attempt: record.runAttempt,
        status: record.status,
        score: record.score,
        passed_tests: record.passedTests,
        total_tests: record.totalTests,
        html_url: record.htmlUrl,
        raw_result: record.rawResult,
        submitted_at: record.submittedAt,
      })
      .select("*")
      .single();

    if (error) {
      // Dua webhook identik yang tiba bersamaan: baris sudah dibuat oleh
      // proses lain. Ambil baris tersebut, jangan membuat duplikat.
      if (error.code === UNIQUE_VIOLATION) {
        const existing = await submissionStore.findSubmission(
          record.studentRepositoryId,
          record.workflowRunId,
          record.runAttempt,
        );
        if (existing) return existing;
      }
      throw new Error(`Supabase: ${error.message}`);
    }

    return data;
  },

  async updateSubmission(id, patch) {
    return unwrap(
      await db()
        .from("submissions")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single(),
    );
  },

  async replaceTestResults(submissionId: string, tests: TestResultRecord[]) {
    const client = db();

    const removal = await client
      .from("test_results")
      .delete()
      .eq("submission_id", submissionId);
    if (removal.error) throw new Error(`Supabase: ${removal.error.message}`);

    if (tests.length === 0) return;

    const insertion = await client.from("test_results").insert(
      tests.map((test) => ({
        submission_id: submissionId,
        ordinal: test.ordinal,
        name: test.name,
        status: test.status,
        points: test.points,
        message: test.message,
      })),
    );
    if (insertion.error) throw new Error(`Supabase: ${insertion.error.message}`);
  },
};

// -----------------------------------------------------------------------------
// Kueri untuk gradebook & dasbor
// -----------------------------------------------------------------------------

export async function listSubmissions(params: {
  assignmentId: string;
  userId?: string;
  userIds?: string[];
}): Promise<Submission[]> {
  let query = db()
    .from("submissions")
    .select("*")
    .eq("assignment_id", params.assignmentId)
    .order("submitted_at", { ascending: true });

  if (params.userId) query = query.eq("user_id", params.userId);
  if (params.userIds) {
    if (params.userIds.length === 0) return [];
    query = query.in("user_id", params.userIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function listSubmissionsForUser(
  userId: string,
): Promise<Submission[]> {
  const { data, error } = await db()
    .from("submissions")
    .select("*")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const { data, error } = await db()
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function listTestResults(
  submissionId: string,
): Promise<TestResult[]> {
  const { data, error } = await db()
    .from("test_results")
    .select("*")
    .eq("submission_id", submissionId)
    .order("ordinal");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}
