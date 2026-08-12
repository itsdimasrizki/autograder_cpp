import type { Submission, SubmissionStatus, TestStatus } from "@/lib/db/types";
import type { GradingResult } from "@/lib/grading/result";

/**
 * Penyerapan hasil penilaian ke database.
 *
 * Modul ini tidak mengimpor Supabase secara langsung; ia bekerja di atas
 * antarmuka `SubmissionStore` sehingga logika idempotensinya dapat diuji
 * tanpa database sungguhan.
 */

export interface RunInfo {
  runId: number;
  runAttempt: number;
  headSha: string;
  /** "queued" | "in_progress" | "completed" */
  status: string;
  /** "success" | "failure" | "cancelled" | ... (null bila belum selesai) */
  conclusion: string | null;
  htmlUrl: string | null;
  updatedAt: string | null;
}

export interface SubmissionRecord {
  assignmentId: string;
  userId: string;
  studentRepositoryId: string;
  commitSha: string;
  workflowRunId: number;
  runAttempt: number;
  status: SubmissionStatus;
  score: number | null;
  passedTests: number | null;
  totalTests: number | null;
  htmlUrl: string | null;
  rawResult: unknown | null;
  submittedAt: string;
}

export interface TestResultRecord {
  ordinal: number;
  name: string;
  status: TestStatus;
  points: number;
  message: string | null;
}

export interface SubmissionStore {
  findSubmission(
    studentRepositoryId: string,
    workflowRunId: number,
    runAttempt: number,
  ): Promise<Submission | null>;

  insertSubmission(record: SubmissionRecord): Promise<Submission>;

  updateSubmission(
    id: string,
    patch: Partial<
      Pick<
        Submission,
        | "status"
        | "score"
        | "passed_tests"
        | "total_tests"
        | "html_url"
        | "raw_result"
        | "commit_sha"
      >
    >,
  ): Promise<Submission>;

  /** Mengganti seluruh rincian test milik sebuah submission (bukan menambah). */
  replaceTestResults(
    submissionId: string,
    tests: TestResultRecord[],
  ): Promise<void>;
}

/**
 * Menentukan status submission dari status workflow dan hasil penilaian.
 *
 * Workflow yang sudah selesai tetapi tidak menghasilkan result.json dianggap
 * ERROR — bukan diabaikan — supaya percobaan tersebut tetap terlihat oleh
 * asisten.
 */
export function deriveStatus(
  run: RunInfo,
  result: GradingResult | null,
): SubmissionStatus {
  if (result) return result.status;
  if (run.status === "completed") {
    return run.conclusion === "success" ? "ERROR" : "ERROR";
  }
  return run.status === "in_progress" ? "RUNNING" : "QUEUED";
}

/** Menyusun baris submission dari sebuah run. Murni. */
export function buildSubmissionRecord(params: {
  assignmentId: string;
  userId: string;
  studentRepositoryId: string;
  run: RunInfo;
  result: GradingResult | null;
}): SubmissionRecord {
  const { run, result } = params;

  return {
    assignmentId: params.assignmentId,
    userId: params.userId,
    studentRepositoryId: params.studentRepositoryId,
    // SHA dari GitHub adalah sumber kebenaran; result.json hanya cadangan.
    commitSha: run.headSha || result?.commitSha || "",
    workflowRunId: run.runId,
    runAttempt: run.runAttempt,
    status: deriveStatus(run, result),
    score: result ? result.score : null,
    passedTests: result ? result.passed : null,
    totalTests: result ? result.total : null,
    htmlUrl: run.htmlUrl,
    rawResult: result ? (result as unknown) : null,
    submittedAt: run.updatedAt ?? new Date().toISOString(),
  };
}

export function buildTestRecords(
  result: GradingResult | null,
): TestResultRecord[] {
  if (!result) return [];
  return result.tests.map((test, index) => ({
    ordinal: index,
    name: test.name,
    status: test.status,
    points: test.points,
    message: test.message || null,
  }));
}

export interface IngestOutcome {
  submission: Submission;
  created: boolean;
  updated: boolean;
}

/**
 * Menyimpan satu percobaan pengumpulan.
 *
 * IDEMPOTEN: kunci (student_repository_id, workflow_run_id, run_attempt)
 * memastikan pengiriman webhook ganda dari GitHub tidak pernah menghasilkan
 * dua baris submission. Bila baris sudah ada, isinya hanya diperbarui saat
 * benar-benar ada perubahan (mis. RUNNING -> PASS).
 *
 * Riwayat tidak pernah ditimpa: percobaan berikutnya punya run id berbeda,
 * sehingga menjadi baris baru.
 */
export async function ingestGradingRun(params: {
  store: SubmissionStore;
  assignmentId: string;
  userId: string;
  studentRepositoryId: string;
  run: RunInfo;
  result: GradingResult | null;
}): Promise<IngestOutcome> {
  const record = buildSubmissionRecord(params);
  const tests = buildTestRecords(params.result);

  const existing = await params.store.findSubmission(
    params.studentRepositoryId,
    params.run.runId,
    params.run.runAttempt,
  );

  if (!existing) {
    const submission = await params.store.insertSubmission(record);
    if (tests.length > 0) {
      await params.store.replaceTestResults(submission.id, tests);
    }
    return { submission, created: true, updated: false };
  }

  // Sudah ada. Perbarui hanya bila ada informasi baru.
  const unchanged =
    existing.status === record.status &&
    existing.score === record.score &&
    existing.passed_tests === record.passedTests &&
    existing.total_tests === record.totalTests;

  if (unchanged) {
    return { submission: existing, created: false, updated: false };
  }

  // Jangan menurunkan hasil final menjadi status sementara: webhook yang
  // datang terlambat (mis. "requested" setelah "completed") tidak boleh
  // menghapus nilai yang sudah tersimpan.
  const isFinal = (status: SubmissionStatus) =>
    status === "PASS" || status === "FAIL" || status === "ERROR";
  if (isFinal(existing.status) && !isFinal(record.status)) {
    return { submission: existing, created: false, updated: false };
  }

  const submission = await params.store.updateSubmission(existing.id, {
    status: record.status,
    score: record.score,
    passed_tests: record.passedTests,
    total_tests: record.totalTests,
    html_url: record.htmlUrl,
    raw_result: record.rawResult,
    commit_sha: record.commitSha || existing.commit_sha,
  });

  if (tests.length > 0) {
    await params.store.replaceTestResults(submission.id, tests);
  }

  return { submission, created: false, updated: true };
}
