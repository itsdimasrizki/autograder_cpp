import type { ScoringMode, Submission, SubmissionStatus } from "@/lib/db/types";

/**
 * Ringkasan nilai. Murni: menerima daftar submission apa adanya dan
 * menghitung tampilan gradebook.
 *
 * Riwayat tidak pernah dibuang — nilai "terbaik" dan "terakhir" sama-sama
 * dihitung, dan mode penilaian tugas menentukan mana yang dipakai.
 */

export interface StudentSummary {
  userId: string;
  attempts: number;
  /** Nilai dari percobaan terakhir yang sudah dinilai. */
  latestScore: number | null;
  bestScore: number | null;
  /** Nilai yang berlaku sesuai scoring_mode tugas. */
  effectiveScore: number | null;
  lastSubmittedAt: string | null;
  status: SubmissionStatus | "NOT_SUBMITTED";
}

/** Percobaan yang sudah punya nilai (bukan yang masih berjalan). */
function isScored(submission: Submission): boolean {
  return (
    submission.score !== null &&
    (submission.status === "PASS" ||
      submission.status === "FAIL" ||
      submission.status === "ERROR")
  );
}

function byTimeAscending(a: Submission, b: Submission): number {
  const diff =
    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  // Waktu bisa sama persis; run id menjaga urutan tetap stabil.
  return diff !== 0 ? diff : a.workflow_run_id - b.workflow_run_id;
}

export function summarizeStudent(
  userId: string,
  submissions: Submission[],
  scoringMode: ScoringMode,
): StudentSummary {
  const mine = submissions
    .filter((submission) => submission.user_id === userId)
    .sort(byTimeAscending);

  if (mine.length === 0) {
    return {
      userId,
      attempts: 0,
      latestScore: null,
      bestScore: null,
      effectiveScore: null,
      lastSubmittedAt: null,
      status: "NOT_SUBMITTED",
    };
  }

  const scored = mine.filter(isScored);
  const last = mine[mine.length - 1];

  const latestScore =
    scored.length > 0 ? (scored[scored.length - 1].score as number) : null;
  const bestScore =
    scored.length > 0
      ? scored.reduce((max, s) => Math.max(max, s.score as number), 0)
      : null;

  return {
    userId,
    attempts: mine.length,
    latestScore,
    bestScore,
    effectiveScore: scoringMode === "BEST" ? bestScore : latestScore,
    lastSubmittedAt: last.submitted_at,
    status: last.status,
  };
}

/** Ringkasan untuk sekumpulan mahasiswa (satu kelas pada satu tugas). */
export function summarizeClass(
  userIds: string[],
  submissions: Submission[],
  scoringMode: ScoringMode,
): StudentSummary[] {
  return userIds.map((userId) =>
    summarizeStudent(userId, submissions, scoringMode),
  );
}

/** Riwayat percobaan seorang mahasiswa, terurut lama ke baru. */
export function attemptHistory(
  userId: string,
  submissions: Submission[],
): Submission[] {
  return submissions
    .filter((submission) => submission.user_id === userId)
    .sort(byTimeAscending);
}

/** Contoh tampilan: "40 → 70 → 100". */
export function formatScoreTrail(submissions: Submission[]): string {
  const scores = submissions.filter(isScored).map((s) => s.score as number);
  return scores.length > 0 ? scores.join(" → ") : "—";
}
