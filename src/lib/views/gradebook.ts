import "server-only";

import { listAssignments } from "@/lib/db/assignments";
import { listClassSettingsForAssignments } from "@/lib/db/assignment-class-settings";
import { listClassMembers } from "@/lib/db/courses";
import { listSubmissions } from "@/lib/db/submissions";
import { resolveAssignmentConfig } from "@/lib/grading/config";
import { summarizeClass, type StudentSummary } from "@/lib/grading/gradebook";
import type { Assignment, Class, Course, User } from "@/lib/db/types";

export type GradebookAssignment = Assignment & {
  summaries: StudentSummary[];
};

export type GradebookRow = {
  user: User;
  scores: Array<number | null>;
  average: number | null;
};

export type ClassGradebook = {
  course: Course;
  klass: Class;
  assignments: GradebookAssignment[];
  rows: GradebookRow[];
};

/**
 * Menyatukan nilai efektif tiap tugas menjadi satu tabel per kelas.
 * Semua pembaca (halaman dan export) memakai fungsi ini agar angkanya selalu
 * konsisten dengan gradebook per tugas yang sudah ada.
 */
export async function loadClassGradebook(params: {
  course: Course;
  klass: Class;
}): Promise<ClassGradebook> {
  const [assignments, members] = await Promise.all([
    listAssignments(params.course.id),
    listClassMembers(params.klass.id, "STUDENT"),
  ]);

  const userIds = members.map((member) => member.user.id);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const settings = await listClassSettingsForAssignments(assignmentIds, [
    params.klass.id,
  ]);
  const settingsByAssignment = new Map(
    settings.map((setting) => [setting.assignment_id, setting]),
  );

  const enriched = await Promise.all(
    assignments.map(async (assignment) => {
      const submissions = await listSubmissions({
        assignmentId: assignment.id,
        userIds,
      });
      const override = settingsByAssignment.get(assignment.id);
      const config = resolveAssignmentConfig(assignment, override);

      return {
        ...assignment,
        summaries: summarizeClass(userIds, submissions, config),
      };
    }),
  );

  const rows = members.map(({ user }) => {
    const scores = enriched.map(
      (assignment) =>
        assignment.summaries.find((summary) => summary.userId === user.id)
          ?.effectiveScore ?? null,
    );
    const available = scores.filter((score): score is number => score !== null);

    return {
      user,
      scores,
      average:
        available.length > 0
          ? available.reduce((sum, score) => sum + score, 0) / available.length
          : null,
    };
  });

  return {
    course: params.course,
    klass: params.klass,
    assignments: enriched,
    rows,
  };
}
