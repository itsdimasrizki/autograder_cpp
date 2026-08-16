import type { ScoringMode, Submission, SubmissionStatus } from "@/lib/db/types";

/**
 * Ringkasan nilai. Murni: menerima daftar submission apa adanya dan
 * menghitung tampilan gradebook.
 *
 * Riwayat tidak pernah dibuang — nilai "pertama", "terbaik", dan "terakhir"
 * ketiganya selalu dihitung, dan mode penilaian tugas hanya memilih mana yang
 * berlaku. Mengubah mode sebuah tugas karena itu tidak pernah kehilangan data.
 */

export interface StudentSummary {
  userId: string;
  attempts: number;
  /** Nilai dari percobaan pertama yang sudah dinilai. */
  firstScore: number | null;
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
      firstScore: null,
      latestScore: null,
      bestScore: null,
      effectiveScore: null,
      lastSubmittedAt: null,
      status: "NOT_SUBMITTED",
    };
  }

  const scored = mine.filter(isScored);
  const last = mine[mine.length - 1];

  const firstScore = scored.length > 0 ? (scored[0].score as number) : null;
  const latestScore =
    scored.length > 0 ? (scored[scored.length - 1].score as number) : null;
  const bestScore =
    scored.length > 0
      ? scored.reduce((max, s) => Math.max(max, s.score as number), 0)
      : null;

  // Percobaan yang masih berjalan sengaja dilewati: "pertama" berarti nilai
  // pertama yang benar-benar ada, bukan percobaan pertama yang belum selesai.
  const effectiveScore = {
    FIRST: firstScore,
    BEST: bestScore,
    LATEST: latestScore,
  }[scoringMode];

  return {
    userId,
    attempts: mine.length,
    firstScore,
    latestScore,
    bestScore,
    effectiveScore,
    lastSubmittedAt: last.submitted_at,
    status: last.status,
  };
}

/** Label mode penilaian untuk ditampilkan ke pengguna. */
export const SCORING_MODE_LABEL: Record<ScoringMode, string> = {
  FIRST: "nilai pertama",
  BEST: "nilai terbaik",
  LATEST: "nilai terakhir",
};

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
