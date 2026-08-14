import "server-only";

import { listAssignments } from "@/lib/db/assignments";
import { listCoursesByIds } from "@/lib/db/courses";
import { listRepositoriesForUser } from "@/lib/db/repositories";
import { listSubmissionsForUser } from "@/lib/db/submissions";
import {
  attemptHistory,
  formatScoreTrail,
  summarizeStudent,
  type StudentSummary,
} from "@/lib/grading/gradebook";
import type {
  Assignment,
  Course,
  StudentRepository,
  Submission,
} from "@/lib/db/types";
import type { AccessContext } from "@/lib/auth/policy";
import { canViewAssignment } from "@/lib/auth/policy";

export interface StudentAssignmentView {
  assignment: Assignment;
  course: Course | undefined;
  repository: StudentRepository | undefined;
  summary: StudentSummary;
  history: Submission[];
  trail: string;
}

/**
 * Menyusun data dasbor seorang mahasiswa.
 *
 * Penyaringan tugas memakai `canViewAssignment` dari kebijakan terpusat,
 * sehingga tugas yang belum diterbitkan tidak pernah bocor.
 */
export async function buildStudentOverview(params: {
  ctx: AccessContext;
  /** Mahasiswa yang datanya ditampilkan (bisa berbeda dari ctx bagi asisten). */
  userId: string;
  courseIds: string[];
}): Promise<StudentAssignmentView[]> {
  // Keempatnya hanya bergantung pada parameter, tidak saling bergantung, jadi
  // dijalankan dalam satu gelombang. Sebelumnya daftar tugas menunggu ketiga
  // query di atas selesai lebih dulu tanpa alasan.
  const [courses, repositories, submissions, assignmentLists] =
    await Promise.all([
      listCoursesByIds(params.courseIds),
      listRepositoriesForUser(params.userId),
      listSubmissionsForUser(params.userId),
      Promise.all(
        params.courseIds.map((courseId) => listAssignments(courseId)),
      ),
    ]);

  const assignments = assignmentLists
    .flat()
    .filter((assignment) => canViewAssignment(params.ctx, assignment))
    .sort((a, b) => a.meeting_number - b.meeting_number);

  return assignments.map((assignment) => {
    const history = attemptHistory(params.userId, submissions).filter(
      (submission) => submission.assignment_id === assignment.id,
    );

    return {
      assignment,
      course: courses.find((course) => course.id === assignment.course_id),
      repository: repositories.find(
        (repository) => repository.assignment_id === assignment.id,
      ),
      summary: summarizeStudent(
        params.userId,
        history,
        assignment.scoring_mode,
      ),
      history,
      trail: formatScoreTrail(history),
    };
  });
}
