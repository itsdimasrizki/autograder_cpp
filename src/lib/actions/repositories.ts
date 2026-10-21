"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { membershipsOf, requireAccessContext } from "@/lib/auth/authorize";
import {
  assert,
  canManageClassRoster,
  canProvisionRepository,
} from "@/lib/auth/policy";
import { getAssignment } from "@/lib/db/assignments";
import { getClass, listClassMembers } from "@/lib/db/courses";
import { findUserById } from "@/lib/db/users";
import {
  countRepositorySubmissions,
  deleteRepositoryRecord,
  findRepository,
  markRepositoryRevoked,
} from "@/lib/db/repositories";
import { deleteRepo, removeCollaborator } from "@/lib/github/repos";
import { env } from "@/lib/env";
import { provisionMany, provisionRepository } from "@/lib/provisioning/provision";
import { runAction, safePath, withResult } from "@/lib/actions/result";

const uuid = z.string().uuid("ID tidak valid.");

/** Menyediakan repository untuk satu mahasiswa. */
export async function provisionOneAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ assignmentId: uuid, userId: uuid })
      .parse({ assignmentId, userId: formData.get("userId") });

    const student = await findUserById(input.userId);
    if (!student) throw new Error("Mahasiswa tidak ditemukan.");

    // Otorisasi berbasis kelas yang benar-benar diikuti mahasiswa tersebut.
    const targetMemberships = await membershipsOf(student.id);
    assert(
      canProvisionRepository(ctx, targetMemberships),
      "Anda tidak mengelola kelas mahasiswa ini.",
    );

    const assignment = await getAssignment(input.assignmentId);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");
    if (!targetMemberships.some((m) => m.course_id === assignment.course_id)) {
      throw new Error("Mahasiswa ini tidak terdaftar pada mata kuliah tersebut.");
    }

    await provisionRepository({ assignment, student });
  });

  const path = safePath(
    classId
      ? `/assignments/${assignmentId}?classId=${classId}`
      : `/assignments/${assignmentId}`,
    "/dashboard",
  );
  revalidatePath(path);
  redirect(withResult(path, message));
}

/** Menyediakan repository untuk seluruh mahasiswa dalam satu kelas. */
export async function provisionClassAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ assignmentId: uuid, classId: uuid })
      .parse({ assignmentId, classId });

    // Harus asisten kelas (atau admin) — sekadar menjadi anggota kelas,
    // seperti mahasiswa, tidak cukup.
    assert(
      canManageClassRoster(ctx, input.classId),
      "Anda bukan asisten kelas ini.",
    );

    const klass = await getClass(input.classId);
    if (!klass) throw new Error("Kelas tidak ditemukan.");

    const assignment = await getAssignment(input.assignmentId);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");
    if (assignment.course_id !== klass.course_id) {
      throw new Error("Tugas ini bukan milik mata kuliah kelas tersebut.");
    }

    const skipUserIds = formData
      .getAll("skipUserId")
      .map(String)
      .filter((value) => uuid.safeParse(value).success);
    const skipped = new Set(skipUserIds);
    const students = (await listClassMembers(input.classId, "STUDENT"))
      .map((m) => m.user)
      .filter((student) => !skipped.has(student.id));
    const result = await provisionMany({ assignment, students });

    if (result.failed > 0) {
      throw new Error(
        `${result.ok} berhasil, ${result.failed} gagal. ${result.errors
          .slice(0, 3)
          .join("; ")}`,
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

/**
 * Membatalkan repository mahasiswa. Histori submission membuat repository
 * tidak boleh dihapus; pada kasus itu hanya akses mahasiswa yang dicabut.
 */
export async function revokeRepositoryAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const classId = String(formData.get("classId") ?? "");
  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    const input = z
      .object({ assignmentId: uuid, classId: uuid, userId: uuid })
      .parse({ assignmentId, classId, userId: formData.get("userId") });

    assert(canManageClassRoster(ctx, input.classId), "Anda bukan asisten kelas ini.");
    const [klass, assignment, repository, student] = await Promise.all([
      getClass(input.classId),
      getAssignment(input.assignmentId),
      findRepository(input.assignmentId, input.userId),
      findUserById(input.userId),
    ]);
    if (!klass || !assignment || assignment.course_id !== klass.course_id) {
      throw new Error("Kelas dan tugas tidak cocok.");
    }
    if (!repository) throw new Error("Repository mahasiswa tidak ditemukan.");
    if (!student) throw new Error("Mahasiswa tidak ditemukan.");
    const targetMemberships = await membershipsOf(student.id);
    assert(
      targetMemberships.some((membership) => membership.class_id === input.classId),
      "Mahasiswa ini bukan anggota kelas tersebut.",
    );

    const submissions = await countRepositorySubmissions(repository.id);
    if (repository.status === "READY") {
      try {
        await removeCollaborator({
          owner: env.githubOrg,
          repo: repository.name,
          username: student.github_login,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (!detail.includes("HTTP 404")) throw error;
      }
    }

    if (submissions > 0) {
      await markRepositoryRevoked(
        repository.id,
        "Akses mahasiswa dicabut; histori submission dipertahankan.",
      );
    } else {
      try {
        await deleteRepo({ owner: env.githubOrg, repo: repository.name });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (!detail.includes("HTTP 404")) throw error;
      }
      await deleteRepositoryRecord(input.assignmentId, input.userId);
    }
  });

  const path = safePath(
    `/assignments/${assignmentId}?classId=${classId}`,
    "/dashboard",
  );
  revalidatePath(path);
  redirect(withResult(path, message));
}
