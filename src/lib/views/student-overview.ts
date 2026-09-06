import "server-only";

import { listAssignments } from "@/lib/db/assignments";
import { listClassSettingsForAssignments } from "@/lib/db/assignment-class-settings";
import { listCoursesByIds, listStudentClassMemberships } from "@/lib/db/courses";
import { listRepositoriesForUser } from "@/lib/db/repositories";
import { listSubmissionsForUser } from "@/lib/db/submissions";
import {
  attemptHistory,
  evaluateAttempts,
  formatScoreTrail,
  summarizeStudent,
  type EvaluatedAttempt,
  type StudentSummary,
} from "@/lib/grading/gradebook";
import {
  pickStudentClassId,
  resolveAssignmentConfig,
  type ResolvedAssignmentConfig,
} from "@/lib/grading/config";
import type { Assignment, Course, StudentRepository } from "@/lib/db/types";
import type { AccessContext } from "@/lib/auth/policy";
import { canViewAssignment } from "@/lib/auth/policy";

export interface StudentAssignmentView {
  assignment: Assignment;
  course: Course | undefined;
  repository: StudentRepository | undefined;
  summary: StudentSummary;
  /** Riwayat percobaan lengkap, masing-masing sudah dinilai kelayakannya. */
  attempts: EvaluatedAttempt[];
  trail: string;
  /** Konfigurasi yang berlaku untuk KELAS mahasiswa ini. */
  config: ResolvedAssignmentConfig;
}

/**
 * Menyusun data dasbor seorang mahasiswa.
 *
 * Tenggat, kuota percobaan, dan mode penilaian diambil dari setelan KELAS yang
 * diikuti mahasiswa ini, bukan dari nilai dasar tugas — dua orang pada tugas
 * yang sama bisa punya tenggat berbeda karena kelasnya berbeda.
 *
 * Penyaringan tugas tetap memakai canViewAssignment dari kebijakan terpusat,
 * sehingga tugas yang belum diterbitkan tidak pernah bocor.
 */
export async function buildStudentOverview(params: {
  ctx: AccessContext;
  /** Mahasiswa yang datanya ditampilkan (bisa berbeda dari ctx bagi asisten). */
  userId: string;
  courseIds: string[];
}): Promise<StudentAssignmentView[]> {
  // Kelimanya hanya bergantung pada parameter, tidak saling bergantung, jadi
  // dijalankan dalam satu gelombang.
  const [courses, repositories, submissions, assignmentLists, memberships] =
    await Promise.all([
      listCoursesByIds(params.courseIds),
      listRepositoriesForUser(params.userId),
      listSubmissionsForUser(params.userId),
      Promise.all(
        params.courseIds.map((courseId) => listAssignments(courseId)),
      ),
      listStudentClassMemberships(params.userId),
    ]);

  const assignments = assignmentLists
    .flat()
    .filter((assignment) => canViewAssignment(params.ctx, assignment))
    .sort((a, b) => a.meeting_number - b.meeting_number);

  // Kelas yang berlaku per course, lalu SATU query untuk seluruh setelan kelas
  // yang menyangkut mahasiswa ini — bukan satu query per tugas.
  const classByCourse = new Map<string, string>();
  for (const courseId of params.courseIds) {
    const classId = pickStudentClassId(memberships, courseId);
    if (classId) classByCourse.set(courseId, classId);
  }

  const settings = await listClassSettingsForAssignments(
    assignments.map((assignment) => assignment.id),
    [...classByCourse.values()],
  );

  return assignments.map((assignment) => {
    const history = attemptHistory(params.userId, submissions).filter(
      (submission) => submission.assignment_id === assignment.id,
    );

    const classId = classByCourse.get(assignment.course_id);
    const override =
      settings.find(
        (row) => row.assignment_id === assignment.id && row.class_id === classId,
      ) ?? null;
    const config = resolveAssignmentConfig(assignment, override);

    const attempts = evaluateAttempts(history, config);

    return {
      assignment,
      course: courses.find((course) => course.id === assignment.course_id),
      repository: repositories.find(
        (repository) => repository.assignment_id === assignment.id,
      ),
      summary: summarizeStudent(params.userId, history, config),
      attempts,
      trail: formatScoreTrail(attempts),
      config,
    };
  });
}
