import type {
  ScoringMode,
  Submission,
  SubmissionStatus,
} from "@/lib/db/types";
import type { ResolvedAssignmentConfig } from "@/lib/grading/config";

/**
 * Ringkasan nilai. Murni: menerima daftar submission apa adanya dan menghitung
 * tampilan gradebook.
 *
 * Riwayat tidak pernah dibuang. Tenggat dan kuota percobaan menyaring saat
 * MEMBACA, bukan saat menyimpan — tabel submissions dan jalur webhook tidak
 * tahu-menahu soal keduanya. Konsekuensinya, mengubah tenggat atau kuota
 * sebuah kelas langsung memperbarui nilai yang tampil, termasuk untuk
 * percobaan yang sudah lewat.
 */

export interface StudentSummary {
  userId: string;
  /** SELURUH percobaan, termasuk yang tidak dihitung dan yang belum dinilai. */
  attempts: number;
  /** Percobaan yang lolos tenggat dan kuota. */
  countedAttempts: number;
  /** Nilai dari percobaan LAYAK pertama yang sudah dinilai. */
  firstScore: number | null;
  /** Nilai dari percobaan LAYAK terakhir yang sudah dinilai. */
  latestScore: number | null;
  bestScore: number | null;
  /** Nilai yang berlaku sesuai scoring_mode yang berlaku untuk kelas ini. */
  effectiveScore: number | null;
  /** Percobaan terakhir apa pun, layak atau tidak. */
  lastSubmittedAt: string | null;
  status: SubmissionStatus | "NOT_SUBMITTED";
}

/** Alasan sebuah percobaan tidak masuk hitungan nilai. */
export type AttemptExclusion =
  | "BELUM_DINILAI"
  | "TERLAMBAT"
  | "LEWAT_KUOTA"
  | "TERLAMBAT_DAN_LEWAT_KUOTA";

export interface EvaluatedAttempt {
  submission: Submission;
  /** Nomor urut di antara percobaan yang sudah dinilai; null bila belum. */
  quotaNumber: number | null;
  late: boolean;
  overQuota: boolean;
  eligible: boolean;
  /** null berarti percobaan ini dihitung. */
  exclusion: AttemptExclusion | null;
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

/**
 * Menentukan percobaan mana yang masuk hitungan nilai di website.
 *
 * Tiga saringan, atas percobaan yang sudah diurut kronologis:
 *
 *   1. Sudah dinilai. Percobaan QUEUED/RUNNING dan ERROR tanpa nilai dilewati
 *      sepenuhnya dan TIDAK memakan jatah kuota — praktikan berkuota 1 yang
 *      push pertamanya gagal kompilasi tidak kehilangan kesempatannya.
 *   2. Tenggat. submitted_at tidak melewati tenggat kelas.
 *   3. Kuota. Nomor urut di antara percobaan yang sudah dinilai tidak melebihi
 *      kuota kelas. Nomor ini tidak peduli tenggat, jadi push kedua yang masih
 *      tepat waktu tetap lewat kuota bila kuotanya 1.
 *
 * Saringan 2 dan 3 berdiri sendiri; satu percobaan bisa kena keduanya.
 */
export function evaluateAttempts(
  submissions: Submission[],
  config: Pick<ResolvedAssignmentConfig, "deadline" | "maxAttempts">,
): EvaluatedAttempt[] {
  // Tenggat yang tidak terbaca diperlakukan sebagai tanpa tenggat. Gagal ke
  // arah aman: lebih ringan menghitung percobaan yang meragukan daripada
  // membuang nilai praktikan karena data rusak.
  const deadlineMs = config.deadline
    ? new Date(config.deadline).getTime()
    : Number.NaN;
  const adaTenggat = !Number.isNaN(deadlineMs);

  let quotaNumber = 0;

  return submissions
    .slice()
    .sort(byTimeAscending)
    .map((submission): EvaluatedAttempt => {
      if (!isScored(submission)) {
        return {
          submission,
          quotaNumber: null,
          late: false,
          overQuota: false,
          eligible: false,
          exclusion: "BELUM_DINILAI",
        };
      }

      quotaNumber += 1;

      const late =
        adaTenggat && new Date(submission.submitted_at).getTime() > deadlineMs;
      const overQuota =
        config.maxAttempts !== null && quotaNumber > config.maxAttempts;
      const eligible = !late && !overQuota;

      const exclusion: AttemptExclusion | null = eligible
        ? null
        : late && overQuota
          ? "TERLAMBAT_DAN_LEWAT_KUOTA"
          : late
            ? "TERLAMBAT"
            : "LEWAT_KUOTA";

      return { submission, quotaNumber, late, overQuota, eligible, exclusion };
    });
}

export function summarizeStudent(
  userId: string,
  submissions: Submission[],
  config: ResolvedAssignmentConfig,
): StudentSummary {
  const mine = submissions
    .filter((submission) => submission.user_id === userId)
    .sort(byTimeAscending);

  if (mine.length === 0) {
    return {
      userId,
      attempts: 0,
      countedAttempts: 0,
      firstScore: null,
      latestScore: null,
      bestScore: null,
      effectiveScore: null,
      lastSubmittedAt: null,
      status: "NOT_SUBMITTED",
    };
  }

  const nilaiLayak = evaluateAttempts(mine, config)
    .filter((attempt) => attempt.eligible)
    .map((attempt) => attempt.submission.score as number);

  const firstScore = nilaiLayak.length > 0 ? nilaiLayak[0] : null;
  const latestScore =
    nilaiLayak.length > 0 ? nilaiLayak[nilaiLayak.length - 1] : null;
  const bestScore = nilaiLayak.length > 0 ? Math.max(...nilaiLayak) : null;

  const effectiveScore = {
    FIRST: firstScore,
    BEST: bestScore,
    LATEST: latestScore,
  }[config.scoringMode];

  const last = mine[mine.length - 1];

  return {
    userId,
    attempts: mine.length,
    countedAttempts: nilaiLayak.length,
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

/** Label singkat alasan sebuah percobaan tidak dihitung. */
export const ATTEMPT_EXCLUSION_LABEL: Record<AttemptExclusion, string> = {
  BELUM_DINILAI: "belum dinilai",
  TERLAMBAT: "terlambat",
  LEWAT_KUOTA: "lewat kuota",
  TERLAMBAT_DAN_LEWAT_KUOTA: "lewat kuota · terlambat",
};

/** Ringkasan untuk sekumpulan mahasiswa (satu kelas pada satu tugas). */
export function summarizeClass(
  userIds: string[],
  submissions: Submission[],
  config: ResolvedAssignmentConfig,
): StudentSummary[] {
  return userIds.map((userId) => summarizeStudent(userId, submissions, config));
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

/**
 * Contoh tampilan: "60 → (85) → (100)".
 *
 * Percobaan yang tidak dihitung tetap ditampilkan, dalam kurung, supaya
 * praktikan tetap mendapat umpan balik atas latihannya tanpa mengira nilainya
 * berlaku.
 */
export function formatScoreTrail(attempts: EvaluatedAttempt[]): string {
  const bagian = attempts
    .filter((attempt) => attempt.exclusion !== "BELUM_DINILAI")
    .map((attempt) =>
      attempt.eligible
        ? String(attempt.submission.score)
        : `(${attempt.submission.score})`,
    );

  return bagian.length > 0 ? bagian.join(" → ") : "—";
}
