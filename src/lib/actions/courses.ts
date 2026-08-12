"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import {
  assert,
  canAssignAssistants,
  canManageClassRoster,
  canManageCourse,
} from "@/lib/auth/policy";
import {
  addMember,
  createClass,
  createCourse,
  getClass,
  removeMember,
} from "@/lib/db/courses";
import { ensureStudentUser } from "@/lib/db/users";
import { lookupGitHubUser } from "@/lib/github/users";
import { runAction, withResult } from "@/lib/actions/result";

const uuid = z.string().uuid("ID tidak valid.");
const login = z
  .string()
  .trim()
  .min(1, "Username GitHub wajib diisi.")
  .max(39, "Username GitHub terlalu panjang.");

// -----------------------------------------------------------------------------
// Course & kelas (SUPER_ADMIN)
// -----------------------------------------------------------------------------

export async function createCourseAction(formData: FormData) {
  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(canManageCourse(ctx), "Hanya admin yang dapat membuat mata kuliah.");

    const input = z
      .object({
        name: z.string().trim().min(3, "Nama mata kuliah minimal 3 karakter."),
        term: z.string().trim().max(50).optional(),
        description: z.string().trim().max(500).optional(),
      })
      .parse({
        name: formData.get("name"),
        term: formData.get("term") || undefined,
        description: formData.get("description") || undefined,
      });

    await createCourse({
      name: input.name,
      term: input.term ?? null,
      description: input.description ?? null,
      createdBy: ctx.user.id,
    });
  });

  revalidatePath("/courses");
  revalidatePath("/admin");
  redirect(withResult("/admin", message));
}

export async function createClassAction(formData: FormData) {
  const courseId = String(formData.get("courseId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(canManageCourse(ctx), "Hanya admin yang dapat membuat kelas.");

    const input = z
      .object({
        courseId: uuid,
        name: z.string().trim().min(1, "Nama kelas wajib diisi.").max(50),
      })
      .parse({ courseId, name: formData.get("name") });

    await createClass({ courseId: input.courseId, name: input.name });
  });

  revalidatePath(`/courses/${courseId}`);
  redirect(withResult(`/courses/${courseId}`, message));
}

// -----------------------------------------------------------------------------
// Keanggotaan kelas
// -----------------------------------------------------------------------------

/**
 * Menambahkan mahasiswa ke sebuah kelas berdasarkan username GitHub.
 *
 * Username diverifikasi lebih dulu ke GitHub, sehingga identitas (github_user_id)
 * selalu asli dan tidak berasal dari input bebas.
 */
export async function addStudentAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ classId: uuid, githubLogin: login })
      .parse({ classId, githubLogin: formData.get("githubLogin") });

    // Otorisasi dievaluasi terhadap kelas yang diminta, bukan terhadap
    // course_id kiriman browser (mencegah IDOR).
    assert(
      canManageClassRoster(ctx, input.classId),
      "Anda bukan asisten kelas ini.",
    );

    const klass = await getClass(input.classId);
    if (!klass) throw new Error("Kelas tidak ditemukan.");

    const githubUser = await lookupGitHubUser(input.githubLogin);
    if (!githubUser) {
      throw new Error(
        `Akun GitHub "${input.githubLogin}" tidak ditemukan.`,
      );
    }

    const student = await ensureStudentUser(githubUser);

    await addMember({
      courseId: klass.course_id,
      classId: klass.id,
      userId: student.id,
      role: "STUDENT",
    });
  });

  revalidatePath(`/classes/${classId}`);
  redirect(withResult(`/classes/${classId}`, message));
}

/** Menugaskan asisten ke sebuah kelas. Hanya SUPER_ADMIN. */
export async function assignAssistantAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(
      canAssignAssistants(ctx),
      "Hanya admin yang dapat menugaskan asisten.",
    );

    const input = z
      .object({ classId: uuid, githubLogin: login })
      .parse({ classId, githubLogin: formData.get("githubLogin") });

    const klass = await getClass(input.classId);
    if (!klass) throw new Error("Kelas tidak ditemukan.");

    const githubUser = await lookupGitHubUser(input.githubLogin);
    if (!githubUser) {
      throw new Error(`Akun GitHub "${input.githubLogin}" tidak ditemukan.`);
    }

    const user = await ensureStudentUser(githubUser);

    await addMember({
      courseId: klass.course_id,
      classId: klass.id,
      userId: user.id,
      role: "ASSISTANT",
    });
  });

  revalidatePath(`/classes/${classId}`);
  redirect(withResult(`/classes/${classId}`, message));
}

export async function removeMemberAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ classId: uuid, userId: uuid })
      .parse({ classId, userId: formData.get("userId") });

    assert(
      canManageClassRoster(ctx, input.classId),
      "Anda bukan asisten kelas ini.",
    );

    await removeMember(input.classId, input.userId);
  });

  revalidatePath(`/classes/${classId}`);
  redirect(withResult(`/classes/${classId}`, message));
}
