import "server-only";

import { getAssignment } from "@/lib/db/assignments";
import { findRepositoryByFullName } from "@/lib/db/repositories";
import { submissionStore } from "@/lib/db/submissions";
import { fetchGradingResult, listWorkflowRuns } from "@/lib/github/actions";
import { parseFullName } from "@/lib/github/naming";
import { ingestGradingRun, type IngestOutcome, type RunInfo } from "@/lib/grading/ingest";
import { GradingResultError } from "@/lib/grading/result";
import type { Assignment, StudentRepository } from "@/lib/db/types";

/**
 * Menjembatani GitHub Actions dan database.
 *
 * Dua jalur masuk, keduanya bermuara pada `ingestGradingRun` yang idempoten:
 *   1. webhook workflow_run (jalur utama, hampir real-time),
 *   2. tombol "Segarkan" (cadangan bila webhook terlewat).
 */

/** Mengambil hasil penilaian; error parsing tidak boleh membatalkan pencatatan. */
async function safeFetchResult(params: {
  owner: string;
  repo: string;
  runId: number;
  maxScore: number;
}) {
  try {
    return await fetchGradingResult(params);
  } catch (error) {
    if (error instanceof GradingResultError) {
      console.error("[sync] result.json tidak valid:", error.message);
      return null;
    }
    throw error;
  }
}

/** Menyerap satu workflow run untuk repository yang sudah diketahui. */
export async function syncRun(params: {
  repository: StudentRepository;
  assignment: Assignment;
  run: RunInfo;
  /** Ambil artifact hanya bila run sudah selesai. */
  fetchResult: boolean;
}): Promise<IngestOutcome> {
  const result = params.fetchResult
    ? await safeFetchResult({
        owner: params.repository.owner,
        repo: params.repository.name,
        runId: params.run.runId,
        maxScore: params.assignment.max_score,
      })
    : null;

  return ingestGradingRun({
    store: submissionStore,
    assignmentId: params.assignment.id,
    userId: params.repository.user_id,
    studentRepositoryId: params.repository.id,
    run: params.run,
    result,
  });
}

/**
 * Jalur webhook: dari nama repository ke submission tersimpan.
 * Mengembalikan null bila repository bukan milik sistem ini.
 */
export async function syncFromWebhook(params: {
  repositoryFullName: string;
  run: RunInfo;
}): Promise<IngestOutcome | null> {
  const repository = await findRepositoryByFullName(params.repositoryFullName);
  if (!repository) return null;

  const assignment = await getAssignment(repository.assignment_id);
  if (!assignment) return null;

  return syncRun({
    repository,
    assignment,
    run: params.run,
    fetchResult: params.run.status === "completed",
  });
}

/**
 * Jalur cadangan: membaca ulang workflow run terbaru sebuah repository.
 *
 * Dipakai lewat tombol "Segarkan" bila webhook belum dikonfigurasi atau ada
 * kiriman yang terlewat. Aman dijalankan berkali-kali.
 */
export async function refreshRepository(params: {
  repository: StudentRepository;
  assignment: Assignment;
  limit?: number;
}): Promise<{ synced: number; created: number }> {
  const parsed = parseFullName(params.repository.full_name);
  if (!parsed) throw new Error("Nama repository tidak valid.");

  const runs = await listWorkflowRuns(
    parsed.owner,
    parsed.repo,
    params.limit ?? 20,
  );

  let created = 0;
  for (const run of runs) {
    const outcome = await syncRun({
      repository: params.repository,
      assignment: params.assignment,
      run: {
        runId: run.id,
        runAttempt: run.run_attempt ?? 1,
        headSha: run.head_sha,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        updatedAt: run.updated_at ?? run.created_at,
      },
      fetchResult: run.status === "completed",
    });
    if (outcome.created) created++;
  }

  return { synced: runs.length, created };
}
