"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { membershipsOf, requireAccessContext } from "@/lib/auth/authorize";
import {
  assert,
  canManageClassRoster,
  canViewStudentData,
} from "@/lib/auth/policy";
import { getAssignment } from "@/lib/db/assignments";
import { listClassMembers } from "@/lib/db/courses";
import { findRepository } from "@/lib/db/repositories";
import { refreshRepository } from "@/lib/grading/sync";
import { runAction, safePath, withResult } from "@/lib/actions/result";

const uuid = z.string().uuid("ID tidak valid.");

/**
 * Menarik ulang hasil GitHub Actions untuk satu mahasiswa.
 *
 * Cadangan bila webhook belum aktif atau ada kiriman yang terlewat.
 */
export async function refreshStudentAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ assignmentId: uuid, userId: uuid })
      .parse({ assignmentId, userId: formData.get("userId") });

    const targetMemberships = await membershipsOf(input.userId);
    assert(
      canViewStudentData(ctx, input.userId, targetMemberships),
      "Anda tidak berhak melihat data mahasiswa ini.",
    );

    const assignment = await getAssignment(input.assignmentId);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");

    const repository = await findRepository(assignment.id, input.userId);
    if (!repository) {
      throw new Error("Repository untuk tugas ini belum disediakan.");
    }

    await refreshRepository({ repository, assignment });
  });

  const path = safePath(
    redirectTo || `/assignments/${assignmentId}`,
    "/dashboard",
  );
  revalidatePath(path);
  redirect(withResult(path, message));
}

/** Menarik ulang hasil untuk seluruh mahasiswa dalam satu kelas. */
export async function refreshClassAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ assignmentId: uuid, classId: uuid })
      .parse({ assignmentId, classId });

    assert(
      canManageClassRoster(ctx, input.classId),
      "Anda bukan asisten kelas ini.",
    );

    const assignment = await getAssignment(input.assignmentId);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");

    const members = await listClassMembers(input.classId, "STUDENT");
    const failures: string[] = [];

    for (const member of members) {
      const targetMemberships = await membershipsOf(member.user.id);
      // Setiap mahasiswa diperiksa satu per satu, bukan sekadar "punya akses
      // ke kelas": mencegah kebocoran bila keanggotaan berubah.
      if (!canViewStudentData(ctx, member.user.id, targetMemberships)) continue;

      const repository = await findRepository(assignment.id, member.user.id);
      if (!repository || repository.status !== "READY") continue;

      try {
        await refreshRepository({ repository, assignment });
      } catch (error) {
        failures.push(
          `@${member.user.github_login}: ${
            error instanceof Error ? error.message : "gagal"
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Sebagian gagal disegarkan. ${failures.slice(0, 3).join("; ")}`,
      );
    }
  });

  const path = safePath(
    `/assignments/${assignmentId}?classId=${classId}`,
    "/dashboard",
  );
  revalidatePath(path);
  redirect(withResult(path, message));
}
