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
