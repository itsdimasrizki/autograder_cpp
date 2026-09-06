import type {
  Assignment,
  AssignmentClassSettings,
  ScoringMode,
} from "@/lib/db/types";

/**
 * Konfigurasi tugas yang benar-benar berlaku untuk sebuah kelas.
 *
 * Murni tanpa I/O supaya dapat diuji langsung dan dipakai ulang oleh halaman,
 * server action, maupun modul penilaian.
 */

export interface ResolvedAssignmentConfig {
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
  /** Dari mana nilai ini berasal — dipakai UI untuk menampilkan lencana. */
  source: "KELAS" | "DASAR";
}

/** Bagian tabel assignments yang menjadi nilai dasar. */
export type AssignmentDefaults = Pick<
  Assignment,
  "deadline" | "max_attempts" | "scoring_mode"
>;

/**
 * Resolusinya seluruh-baris, bukan per-field.
 *
 * Form asisten menampilkan ketiga field sekaligus, terisi nilai yang sedang
 * berlaku. Kalau disimpan per-field-null, asisten yang hanya bermaksud
 * menggeser tenggat tidak akan sadar bahwa dua field lain masih menempel ke
 * nilai dasar dan bisa berubah kemudian. Dengan seluruh-baris, apa yang
 * dilihat asisten saat menekan simpan itulah yang terkunci untuk kelasnya.
 */
export function resolveAssignmentConfig(
  assignment: AssignmentDefaults,
  override: AssignmentClassSettings | null | undefined,
): ResolvedAssignmentConfig {
  if (override) {
    return {
      deadline: override.deadline,
      maxAttempts: override.max_attempts,
      scoringMode: override.scoring_mode,
      source: "KELAS",
    };
  }

  return {
    deadline: assignment.deadline,
    maxAttempts: assignment.max_attempts,
    scoringMode: assignment.scoring_mode,
    source: "DASAR",
  };
}

export interface StudentClassMembership {
  course_id: string;
  class_id: string;
  created_at: string;
}

/**
 * Kelas mana yang konfigurasinya berlaku untuk seorang mahasiswa pada sebuah
 * course.
 *
 * `unique (class_id, user_id)` di course_members tidak melarang seseorang
 * terdaftar di dua kelas pada course yang sama, meski komentar skema menyebut
 * "tepat satu kelas per course". Supaya nilai yang tampil tidak pernah
 * bergantung pada urutan baris yang kebetulan dikembalikan database,
 * pilihannya dipatok: keanggotaan paling awal, dengan class_id terkecil
 * sebagai pemecah seri.
 */
export function pickStudentClassId(
  memberships: StudentClassMembership[],
  courseId: string,
): string | null {
  const kandidat = memberships
    .filter((m) => m.course_id === courseId)
    .slice()
    .sort((a, b) => {
      const selisih =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return selisih !== 0 ? selisih : a.class_id.localeCompare(b.class_id);
    });

  return kandidat[0]?.class_id ?? null;
}
