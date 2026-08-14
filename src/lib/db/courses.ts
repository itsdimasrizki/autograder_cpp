import "server-only";

import { db, unwrap } from "@/lib/db/client";
import type {
  Class,
  Course,
  CourseMember,
  MemberRole,
  User,
} from "@/lib/db/types";
import type { Membership } from "@/lib/auth/policy";

// -----------------------------------------------------------------------------
// Keanggotaan
// -----------------------------------------------------------------------------

export async function listMembershipsOf(userId: string): Promise<Membership[]> {
  const { data, error } = await db()
    .from("course_members")
    .select("course_id, class_id, role")
    .eq("user_id", userId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data ?? []) as Membership[];
}

export interface UserClassLabel {
  class_id: string;
  class_name: string;
  role: MemberRole;
}

/**
 * Kelas yang diikuti sekumpulan pengguna, untuk kolom "Kelas" di halaman
 * /users. Satu query untuk semua pengguna supaya tidak menjadi N+1.
 */
export async function listClassesForUsers(
  userIds: string[],
): Promise<Record<string, UserClassLabel[]>> {
  if (userIds.length === 0) return {};

  const { data, error } = await db()
    .from("course_members")
    .select("user_id, class_id, role, classes!inner(name)")
    .in("user_id", userIds);
  if (error) throw new Error(`Supabase: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<{
    user_id: string;
    class_id: string;
    role: MemberRole;
    classes: { name: string };
  }>;

  const grouped: Record<string, UserClassLabel[]> = {};
  for (const row of rows) {
    (grouped[row.user_id] ??= []).push({
      class_id: row.class_id,
      class_name: row.classes.name,
      role: row.role,
    });
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.class_name.localeCompare(b.class_name));
  }
  return grouped;
}

export async function addMember(params: {
  courseId: string;
  classId: string;
  userId: string;
  role: MemberRole;
}): Promise<CourseMember> {
  const client = db();

  // Idempoten: kalau sudah terdaftar di kelas ini, kembalikan yang ada.
  const existing = await client
    .from("course_members")
    .select("*")
    .eq("class_id", params.classId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (existing.error) throw new Error(`Supabase: ${existing.error.message}`);
  if (existing.data) return existing.data;

  return unwrap(
    await client
      .from("course_members")
      .insert({
        course_id: params.courseId,
        class_id: params.classId,
        user_id: params.userId,
        role: params.role,
      })
      .select("*")
      .single(),
  );
}

export async function removeMember(
  classId: string,
  userId: string,
): Promise<void> {
  const { error } = await db()
    .from("course_members")
    .delete()
    .eq("class_id", classId)
    .eq("user_id", userId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

export interface ClassMember {
  membership: CourseMember;
  user: User;
}

export async function listClassMembers(
  classId: string,
  role?: MemberRole,
): Promise<ClassMember[]> {
  let query = db()
    .from("course_members")
    .select("*, users!inner(*)")
    .eq("class_id", classId);
  if (role) query = query.eq("role", role);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);

  return ((data ?? []) as Array<CourseMember & { users: User }>)
    .map(({ users, ...membership }) => ({ membership, user: users }))
    .sort((a, b) =>
      (a.user.display_name ?? a.user.github_login).localeCompare(
        b.user.display_name ?? b.user.github_login,
      ),
    );
}

// -----------------------------------------------------------------------------
// Course
// -----------------------------------------------------------------------------

export async function listAllCourses(): Promise<Course[]> {
  const { data, error } = await db()
    .from("courses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function listCoursesByIds(ids: string[]): Promise<Course[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db()
    .from("courses")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getCourse(id: string): Promise<Course | null> {
  const { data, error } = await db()
    .from("courses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function createCourse(params: {
  name: string;
  term: string | null;
  description: string | null;
  createdBy: string;
}): Promise<Course> {
  return unwrap(
    await db()
      .from("courses")
      .insert({
        name: params.name,
        term: params.term,
        description: params.description,
        created_by: params.createdBy,
      })
      .select("*")
      .single(),
  );
}

// -----------------------------------------------------------------------------
// Class
// -----------------------------------------------------------------------------

export async function listClasses(courseId: string): Promise<Class[]> {
  const { data, error } = await db()
    .from("classes")
    .select("*")
    .eq("course_id", courseId)
    .order("name");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function getClass(id: string): Promise<Class | null> {
  const { data, error } = await db()
    .from("classes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function createClass(params: {
  courseId: string;
  name: string;
}): Promise<Class> {
  return unwrap(
    await db()
      .from("classes")
      .insert({ course_id: params.courseId, name: params.name })
      .select("*")
      .single(),
  );
}

/** Jumlah mahasiswa per kelas, untuk ditampilkan di daftar kelas. */
export async function countStudentsByClass(
  courseId: string,
): Promise<Record<string, number>> {
  const { data, error } = await db()
    .from("course_members")
    .select("class_id")
    .eq("course_id", courseId)
    .eq("role", "STUDENT");
  if (error) throw new Error(`Supabase: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.class_id] = (counts[row.class_id] ?? 0) + 1;
  }
  return counts;
}
