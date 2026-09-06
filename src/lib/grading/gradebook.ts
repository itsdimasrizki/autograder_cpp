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
 * Riwayat tidak pernah dibuang. Yang menyaring nilai hanyalah KUOTA
 * percobaan, dan penyaringannya terjadi saat MEMBACA, bukan saat menyimpan —
 * tabel submissions dan jalur webhook tidak tahu-menahu soal itu.
 *
 * TENGGAT tidak menyaring apa pun. Percobaan yang lewat tenggat tetap dihitung
 * sesuai mode penilaian kelasnya dan nilainya tetap tampil; ia hanya ditandai
 * `late` supaya asisten tahu, lalu asisten sendiri yang memutuskan mau
 * memakainya atau tidak. Keputusan itu sengaja tidak diotomatiskan.
 */

export interface StudentSummary {
  userId: string;
  /** SELURUH percobaan, termasuk yang tidak dihitung dan yang belum dinilai. */
  attempts: number;
  /** Percobaan yang lolos kuota. */
  countedAttempts: number;
  /** Nilai dari percobaan LAYAK pertama yang sudah dinilai. */
  firstScore: number | null;
  /** Nilai dari percobaan LAYAK terakhir yang sudah dinilai. */
  latestScore: number | null;
  bestScore: number | null;
  /** Nilai yang berlaku sesuai scoring_mode yang berlaku untuk kelas ini. */
  effectiveScore: number | null;
  /**
   * Apakah percobaan yang MENGHASILKAN effectiveScore itu lewat tenggat.
   *
   * Sengaja bukan "orang ini pernah telat": yang perlu diketahui asisten
   * adalah apakah angka yang sedang ia lihat berasal dari push yang telat.
   */
  effectiveLate: boolean;
  /** Percobaan terakhir apa pun, layak atau tidak. */
  lastSubmittedAt: string | null;
  status: SubmissionStatus | "NOT_SUBMITTED";
}

/**
 * Alasan sebuah percobaan tidak masuk hitungan nilai.
 *
 * Keterlambatan TIDAK ada di sini: percobaan yang telat tetap dihitung, dan
 * status telatnya dibawa terpisah lewat `EvaluatedAttempt.late`.
 */
export type AttemptExclusion = "BELUM_DINILAI" | "LEWAT_KUOTA";

export interface EvaluatedAttempt {
  submission: Submission;
  /** Nomor urut di antara percobaan yang sudah dinilai; null bila belum. */
  quotaNumber: number | null;
  /** Lewat tenggat kelas. Penanda saja — tidak mempengaruhi `eligible`. */
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
 * Dua saringan, atas percobaan yang sudah diurut kronologis:
 *
 *   1. Sudah dinilai. Percobaan QUEUED/RUNNING dan ERROR tanpa nilai dilewati
 *      sepenuhnya dan TIDAK memakan jatah kuota — praktikan berkuota 1 yang
 *      push pertamanya gagal kompilasi tidak kehilangan kesempatannya.
 *   2. Kuota. Nomor urut di antara percobaan yang sudah dinilai tidak melebihi
 *      kuota kelas.
 *
 * Tenggat BUKAN saringan. Percobaan yang lewat tenggat tetap `eligible` dan
 * tetap masuk hitungan mode penilaian; ia hanya ditandai `late` supaya terlihat
 * asisten. Yang memutuskan diterima atau tidak adalah asisten, bukan aplikasi.
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

      // Hanya kuota yang menentukan kelayakan; keterlambatan tidak.
      const eligible = !overQuota;

      return {
        submission,
        quotaNumber,
        late,
        overQuota,
        eligible,
        exclusion: eligible ? null : "LEWAT_KUOTA",
      };
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
      effectiveLate: false,
      lastSubmittedAt: null,
      status: "NOT_SUBMITTED",
    };
  }

  // Yang dilacak adalah percobaannya, bukan sekadar angkanya, supaya bisa
  // diketahui apakah nilai yang berlaku berasal dari push yang telat.
  const layak = evaluateAttempts(mine, config).filter(
    (attempt) => attempt.eligible,
  );

  const skor = (attempt: EvaluatedAttempt) => attempt.submission.score as number;

  const pertama = layak[0] ?? null;
  const terakhir = layak[layak.length - 1] ?? null;
  // Seri dimenangkan percobaan yang lebih awal: hasilnya deterministik, dan
  // yang lebih awal lebih kecil kemungkinannya terlambat.
  const terbaik = layak.reduce<EvaluatedAttempt | null>(
    (max, attempt) =>
      max === null || skor(attempt) > skor(max) ? attempt : max,
    null,
  );

  const berlaku = {
    FIRST: pertama,
    BEST: terbaik,
    LATEST: terakhir,
  }[config.scoringMode];

  const last = mine[mine.length - 1];

  return {
    userId,
    attempts: mine.length,
    countedAttempts: layak.length,
    firstScore: pertama ? skor(pertama) : null,
    latestScore: terakhir ? skor(terakhir) : null,
    bestScore: terbaik ? skor(terbaik) : null,
    effectiveScore: berlaku ? skor(berlaku) : null,
    effectiveLate: berlaku?.late ?? false,
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
  LEWAT_KUOTA: "lewat kuota",
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
