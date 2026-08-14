/**
 * Aturan penghapusan sumber daya yang sudah punya jejak.
 *
 * Fungsi di sini murni (tanpa I/O) supaya bisa diuji langsung, mengikuti pola
 * yang sama dengan src/lib/auth/policy.ts. Prinsipnya satu: tidak ada nilai
 * mahasiswa maupun repository GitHub yang boleh hilang diam-diam.
 */

export interface AssignmentFootprint {
  submissions: number;
  repositories: number;
}

export type AssignmentDeletion = "HAPUS_PERMANEN" | "ARSIPKAN";

/**
 * Tugas tanpa jejak apa pun boleh dihapus permanen. Begitu ada repository
 * mahasiswa atau submission, tugas hanya diarsipkan.
 */
export function decideAssignmentDeletion(
  footprint: AssignmentFootprint,
): AssignmentDeletion {
  return footprint.submissions > 0 || footprint.repositories > 0
    ? "ARSIPKAN"
    : "HAPUS_PERMANEN";
}

export interface TemplateDependent {
  meeting_number: number;
  title: string;
}

/**
 * Template hanya boleh dihapus kalau tidak ada tugas aktif yang memakainya.
 *
 * Menghapusnya saat masih dipakai akan membuat `assignments.template_id`
 * menjadi null (kolomnya `on delete set null`), sehingga penyediaan repository
 * berikutnya gagal tanpa penjelasan.
 */
export function canDeleteTemplate(dependents: TemplateDependent[]): boolean {
  return dependents.length === 0;
}

/** Alasan penolakan yang menyebut tugas mana saja yang masih memakai template. */
export function describeTemplateDependents(
  dependents: TemplateDependent[],
): string {
  const daftar = dependents
    .map((a) => `Pertemuan ${a.meeting_number} (${a.title})`)
    .join(", ");
  return (
    `Template masih dipakai ${dependents.length} tugas aktif: ${daftar}. ` +
    "Lepaskan template dari tugas tersebut lebih dulu."
  );
}
