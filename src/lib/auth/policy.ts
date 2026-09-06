/**
 * Kebijakan otorisasi — SATU-SATUNYA tempat aturan akses ditulis.
 *
 * Semua fungsi di sini murni (tanpa I/O) supaya bisa diuji langsung dan
 * dipakai ulang oleh halaman, server action, maupun route handler.
 *
 * Prinsip:
 *   - SUPER_ADMIN boleh semuanya.
 *   - Role global ASSISTANT tidak memberi akses apa pun dengan sendirinya;
 *     akses ditentukan oleh baris course_members pada KELAS tertentu.
 *   - STUDENT hanya melihat dirinya sendiri dan kelas yang diikutinya.
 */

import type { MemberRole, UserRole } from "@/lib/db/types";

export interface Membership {
  course_id: string;
  class_id: string;
  role: MemberRole;
}

export interface Principal {
  id: string;
  role: UserRole;
}

export interface AccessContext {
  user: Principal;
  memberships: Membership[];
}

export class AuthorizationError extends Error {
  constructor(message = "Anda tidak memiliki akses ke sumber daya ini.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function isSuperAdmin(ctx: AccessContext): boolean {
  return ctx.user.role === "SUPER_ADMIN";
}

/** Asisten pada kelas tertentu. */
export function isAssistantOfClass(
  ctx: AccessContext,
  classId: string,
): boolean {
  return ctx.memberships.some(
    (m) => m.class_id === classId && m.role === "ASSISTANT",
  );
}

/** Asisten pada minimal satu kelas dalam course tertentu. */
export function isAssistantOfCourse(
  ctx: AccessContext,
  courseId: string,
): boolean {
  return ctx.memberships.some(
    (m) => m.course_id === courseId && m.role === "ASSISTANT",
  );
}

export function isMemberOfCourse(
  ctx: AccessContext,
  courseId: string,
): boolean {
  return ctx.memberships.some((m) => m.course_id === courseId);
}

export function isMemberOfClass(ctx: AccessContext, classId: string): boolean {
  return ctx.memberships.some((m) => m.class_id === classId);
}

/** Kelas yang boleh dikelola pengguna ini (dipakai untuk memfilter daftar). */
export function managedClassIds(ctx: AccessContext): string[] {
  return ctx.memberships
    .filter((m) => m.role === "ASSISTANT")
    .map((m) => m.class_id);
}

// -----------------------------------------------------------------------------
// Course & class
// -----------------------------------------------------------------------------

/** Membuat/menyunting/menghapus course dan kelas: hanya SUPER_ADMIN. */
export function canManageCourse(ctx: AccessContext): boolean {
  return isSuperAdmin(ctx);
}

export function canViewCourse(ctx: AccessContext, courseId: string): boolean {
  return isSuperAdmin(ctx) || isMemberOfCourse(ctx, courseId);
}

export function canViewClass(ctx: AccessContext, classId: string): boolean {
  return isSuperAdmin(ctx) || isMemberOfClass(ctx, classId);
}

/** Menambah/menghapus mahasiswa pada sebuah kelas. */
export function canManageClassRoster(
  ctx: AccessContext,
  classId: string,
): boolean {
  return isSuperAdmin(ctx) || isAssistantOfClass(ctx, classId);
}

/** Menugaskan asisten ke kelas: hanya SUPER_ADMIN. */
export function canAssignAssistants(ctx: AccessContext): boolean {
  return isSuperAdmin(ctx);
}

/**
 * Membuat / mencabut tautan undangan kelas.
 *
 * Sengaja memakai aturan yang sama dengan pengelolaan roster: siapa pun yang
 * boleh menambahkan mahasiswa secara manual ke kelas ini juga boleh membuat
 * tautan undangannya. Mahasiswa tidak pernah termasuk.
 */
export function canManageJoinLink(
  ctx: AccessContext,
  classId: string,
): boolean {
  return canManageClassRoster(ctx, classId);
}

// -----------------------------------------------------------------------------
// Pengelolaan pengguna
// -----------------------------------------------------------------------------

/** Daftar seluruh pengguna aplikasi: hanya SUPER_ADMIN. */
export function canListAllUsers(ctx: AccessContext): boolean {
  return isSuperAdmin(ctx);
}

/**
 * Bolehkah `ctx` mengubah role `target` menjadi `nextRole`?
 *
 * Aturan:
 *   - hanya SUPER_ADMIN yang boleh mengubah role sama sekali;
 *   - tidak seorang pun boleh mengubah role dirinya sendiri (mencegah admin
 *     terakhir mengunci diri, sekaligus mencegah eskalasi diri);
 *   - role SUPER_ADMIN yang sudah ada tidak boleh diturunkan lewat UI —
 *     pencabutannya dilakukan lewat GITHUB_SUPER_ADMINS + database;
 *   - promosi menjadi SUPER_ADMIN tidak disediakan lewat UI.
 */
export function canChangeRole(
  ctx: AccessContext,
  target: { id: string; role: UserRole },
  nextRole: UserRole,
): boolean {
  if (!isSuperAdmin(ctx)) return false;
  if (ctx.user.id === target.id) return false;
  if (target.role === "SUPER_ADMIN") return false;
  if (nextRole === "SUPER_ADMIN") return false;
  return nextRole !== target.role;
}

/**
 * Menghapus permanen sebuah akun pengguna.
 *
 * Penghapusan ini merambat (ON DELETE CASCADE) ke keanggotaan kelas,
 * student_repositories, dan submissions — jadi seluruh riwayat nilai orang
 * tersebut ikut hilang dan tidak dapat dikembalikan. Karena itu aturannya
 * dibuat seketat perubahan role:
 *   - hanya SUPER_ADMIN,
 *   - tidak boleh menghapus diri sendiri,
 *   - tidak boleh menghapus SUPER_ADMIN lain.
 */
export function canDeleteUser(
  ctx: AccessContext,
  target: { id: string; role: UserRole },
): boolean {
  if (!isSuperAdmin(ctx)) return false;
  if (ctx.user.id === target.id) return false;
  if (target.role === "SUPER_ADMIN") return false;
  return true;
}

// -----------------------------------------------------------------------------
// Assignment
// -----------------------------------------------------------------------------

export interface AssignmentRef {
  id: string;
  course_id: string;
  published: boolean;
}

/** Membuat/menyunting/menerbitkan tugas: hanya SUPER_ADMIN. */
export function canManageAssignment(ctx: AccessContext): boolean {
  return isSuperAdmin(ctx);
}

/**
 * Menyetel tenggat, percobaan maksimal, dan mode penilaian untuk SATU kelas.
 *
 * Sengaja memakai isAssistantOfClass, bukan isAssistantOfCourse: inilah yang
 * membuat asisten Kelas B tidak dapat menyentuh Kelas A, sejalan dengan
 * canManageClassRoster. Satu orang yang memegang beberapa kelas otomatis boleh
 * menyetel semuanya, karena course_members memang membolehkan beberapa baris.
 *
 * Nilai dasar tugas — judul, template, nilai maksimal, terbit/tarik — tetap
 * hanya milik SUPER_ADMIN lewat canManageAssignment.
 */
export function canManageClassAssignmentSettings(
  ctx: AccessContext,
  classId: string,
): boolean {
  return isSuperAdmin(ctx) || isAssistantOfClass(ctx, classId);
}

/**
 * Tugas yang belum diterbitkan hanya terlihat oleh SUPER_ADMIN dan asisten
 * pada course tersebut. Mahasiswa hanya melihat tugas yang sudah diterbitkan
 * pada course yang diikutinya.
 */
export function canViewAssignment(
  ctx: AccessContext,
  assignment: AssignmentRef,
): boolean {
  if (isSuperAdmin(ctx)) return true;
  if (!isMemberOfCourse(ctx, assignment.course_id)) return false;
  if (assignment.published) return true;
  return isAssistantOfCourse(ctx, assignment.course_id);
}

// -----------------------------------------------------------------------------
// Data mahasiswa (repository & submission)
// -----------------------------------------------------------------------------

/**
 * Bolehkah `ctx` melihat data milik mahasiswa lain?
 *
 * Ya bila: dirinya sendiri, SUPER_ADMIN, atau asisten pada SALAH SATU kelas
 * yang juga diikuti mahasiswa tersebut. Inilah yang mencegah Mahasiswa A
 * membaca submission Mahasiswa B, dan Asisten Kelas A membaca Kelas B.
 */
export function canViewStudentData(
  ctx: AccessContext,
  targetUserId: string,
  targetMemberships: Membership[],
): boolean {
  if (ctx.user.id === targetUserId) return true;
  if (isSuperAdmin(ctx)) return true;

  const managed = new Set(managedClassIds(ctx));
  return targetMemberships.some((m) => managed.has(m.class_id));
}

/** Menyediakan/menyiapkan ulang repository untuk seorang mahasiswa. */
export function canProvisionRepository(
  ctx: AccessContext,
  targetMemberships: Membership[],
): boolean {
  if (isSuperAdmin(ctx)) return true;
  const managed = new Set(managedClassIds(ctx));
  return targetMemberships.some((m) => managed.has(m.class_id));
}

/** Versi pelempar error untuk dipakai di server action / route handler. */
export function assert(allowed: boolean, message?: string): void {
  if (!allowed) throw new AuthorizationError(message);
}
