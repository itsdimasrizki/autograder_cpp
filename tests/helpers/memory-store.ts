import type { Submission } from "@/lib/db/types";
import type {
  SubmissionRecord,
  SubmissionStore,
  TestResultRecord,
} from "@/lib/grading/ingest";

/**
 * SubmissionStore in-memory untuk pengujian.
 *
 * Meniru batasan unique (student_repository_id, workflow_run_id, run_attempt)
 * yang ada di skema SQL, sehingga uji idempotensi benar-benar bermakna.
 */
export class MemoryStore implements SubmissionStore {
  submissions: Submission[] = [];
  testResults = new Map<string, TestResultRecord[]>();
  insertCount = 0;

  private nextId = 1;

  async findSubmission(
    studentRepositoryId: string,
    workflowRunId: number,
    runAttempt: number,
  ): Promise<Submission | null> {
    return (
      this.submissions.find(
        (submission) =>
          submission.student_repository_id === studentRepositoryId &&
          submission.workflow_run_id === workflowRunId &&
          submission.run_attempt === runAttempt,
      ) ?? null
    );
  }

  async insertSubmission(record: SubmissionRecord): Promise<Submission> {
    const duplicate = await this.findSubmission(
      record.studentRepositoryId,
      record.workflowRunId,
      record.runAttempt,
    );
    if (duplicate) {
      throw new Error("unique violation: submission sudah ada");
    }

    this.insertCount++;
    const now = new Date().toISOString();
    const submission: Submission = {
      id: `sub-${this.nextId++}`,
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
      created_at: now,
      updated_at: now,
    };
    this.submissions.push(submission);
    return submission;
  }

  async updateSubmission(
    id: string,
    patch: Partial<Submission>,
  ): Promise<Submission> {
    const submission = this.submissions.find((entry) => entry.id === id);
    if (!submission) throw new Error("submission tidak ditemukan");
    Object.assign(submission, patch, { updated_at: new Date().toISOString() });
    return submission;
  }

  async replaceTestResults(
    submissionId: string,
    tests: TestResultRecord[],
  ): Promise<void> {
    this.testResults.set(submissionId, tests);
  }
}
