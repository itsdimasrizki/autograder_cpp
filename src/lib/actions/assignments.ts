"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import { assert, canManageAssignment } from "@/lib/auth/policy";
import {
  archiveAssignment,
  countAssignmentFootprint,
  createAssignment,
  createTemplate,
  deleteAssignment,
  deleteTemplate,
  getAssignment,
  getTemplate,
  listAssignmentsUsingTemplate,
  restoreAssignment,
  updateAssignment,
  updateTemplate,
} from "@/lib/db/assignments";
import { isValidGitHubLogin } from "@/lib/github/naming";
import {
  canDeleteTemplate,
  decideAssignmentDeletion,
  describeTemplateDependents,
} from "@/lib/lifecycle";
import { runAction, withResult } from "@/lib/actions/result";

const uuid = z.string().uuid("ID tidak valid.");

/** "" -> null, sekaligus memvalidasi tanggal ISO dari <input type="datetime-local">. */
function optionalDate(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("Tenggat tidak valid.");
  return date.toISOString();
}

function optionalInt(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Jumlah percobaan maksimal harus bilangan bulat positif.");
  }
  return parsed;
}

export async function createAssignmentAction(formData: FormData) {
  const courseId = String(formData.get("courseId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(canManageAssignment(ctx), "Hanya admin yang dapat membuat tugas.");

    const input = z
      .object({
        courseId: uuid,
        meetingNumber: z.coerce
          .number()
          .int()
          .min(1, "Nomor pertemuan minimal 1.")
          .max(99),
        title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(200),
        description: z.string().trim().max(5000).optional(),
        maxScore: z.coerce.number().int().min(1).max(1000),
        scoringMode: z.enum(["BEST", "LATEST", "FIRST"]),
        templateId: z.union([uuid, z.literal("")]).optional(),
      })
      .parse({
        courseId,
        meetingNumber: formData.get("meetingNumber"),
        title: formData.get("title"),
        description: formData.get("description") || undefined,
        maxScore: formData.get("maxScore") || 100,
        scoringMode: formData.get("scoringMode") || "BEST",
        templateId: formData.get("templateId") || undefined,
      });

    await createAssignment({
      courseId: input.courseId,
      meetingNumber: input.meetingNumber,
      title: input.title,
      description: input.description ?? null,
      templateId: input.templateId || null,
      maxScore: input.maxScore,
      deadline: optionalDate(formData.get("deadline")),
      maxAttempts: optionalInt(formData.get("maxAttempts")),
      scoringMode: input.scoringMode,
    });
  });

  // courseId tetap kosong bila tugas tidak ditemukan; jangan bentuk URL rusak.
  const target = courseId ? `/courses/${courseId}/assignments` : "/dashboard";
  revalidatePath(target);
  redirect(withResult(target, message));
}

export async function updateAssignmentAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(canManageAssignment(ctx), "Hanya admin yang dapat mengubah tugas.");

    const input = z
      .object({
        assignmentId: uuid,
        title: z.string().trim().min(3).max(200),
        description: z.string().trim().max(5000).optional(),
        maxScore: z.coerce.number().int().min(1).max(1000),
        scoringMode: z.enum(["BEST", "LATEST", "FIRST"]),
        templateId: z.union([uuid, z.literal("")]).optional(),
      })
      .parse({
        assignmentId,
        title: formData.get("title"),
        description: formData.get("description") || undefined,
        maxScore: formData.get("maxScore") || 100,
        scoringMode: formData.get("scoringMode") || "BEST",
        templateId: formData.get("templateId") || undefined,
      });

    await updateAssignment(input.assignmentId, {
      title: input.title,
      description: input.description ?? null,
      template_id: input.templateId || null,
      max_score: input.maxScore,
      scoring_mode: input.scoringMode,
      deadline: optionalDate(formData.get("deadline")),
      max_attempts: optionalInt(formData.get("maxAttempts")),
    });
  });

  revalidatePath(`/assignments/${assignmentId}`);
  redirect(withResult(`/assignments/${assignmentId}`, message));
}

/** Terbitkan / tarik kembali sebuah tugas. */
export async function togglePublishAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(
      canManageAssignment(ctx),
      "Hanya admin yang dapat menerbitkan tugas.",
    );

    const id = uuid.parse(assignmentId);
    const assignment = await getAssignment(id);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");

    await updateAssignment(id, { published: !assignment.published });
  });

  revalidatePath(`/assignments/${assignmentId}`);
  redirect(withResult(`/assignments/${assignmentId}`, message));
}

/**
 * Menghapus sebuah tugas.
 *
 * Perilaku default sengaja konservatif:
 *   - kalau tugas SUDAH punya repository mahasiswa atau submission, tugas
 *     hanya DIARSIPKAN (archived_at diisi). Repository GitHub mahasiswa tidak
 *     disentuh dan seluruh histori nilai tetap utuh — hanya hilang dari daftar;
 *   - kalau belum ada jejak apa pun, baris tugas dihapus permanen.
 *
 * Dengan begitu tidak ada nilai yang lenyap diam-diam.
 */
export async function deleteAssignmentAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  let courseId = "";

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(canManageAssignment(ctx), "Hanya admin yang dapat menghapus tugas.");

    const id = uuid.parse(assignmentId);
    const assignment = await getAssignment(id);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");
    courseId = assignment.course_id;

    const footprint = await countAssignmentFootprint(id);

    if (decideAssignmentDeletion(footprint) === "ARSIPKAN") {
      await archiveAssignment(id);
      throw new Error(
        `Tugas diarsipkan, bukan dihapus, karena sudah memiliki ` +
          `${footprint.repositories} repository dan ${footprint.submissions} submission. ` +
          "Repository GitHub dan riwayat nilai tetap utuh.",
      );
    }

    await deleteAssignment(id);
  });

  // courseId tetap kosong bila tugas tidak ditemukan; jangan bentuk URL rusak.
  const target = courseId ? `/courses/${courseId}/assignments` : "/dashboard";
  revalidatePath(target);
  redirect(withResult(target, message));
}

/** Mengembalikan tugas yang diarsipkan ke daftar aktif. */
export async function restoreAssignmentAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  let courseId = "";

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(
      canManageAssignment(ctx),
      "Hanya admin yang dapat memulihkan tugas.",
    );

    const id = uuid.parse(assignmentId);
    const assignment = await getAssignment(id);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");
    courseId = assignment.course_id;

    await restoreAssignment(id);
  });

  // courseId tetap kosong bila tugas tidak ditemukan; jangan bentuk URL rusak.
  const target = courseId ? `/courses/${courseId}/assignments` : "/dashboard";
  revalidatePath(target);
  redirect(withResult(target, message));
}

/** Mendaftarkan repository template milik instruktur. */
export async function createTemplateAction(formData: FormData) {
  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(
      canManageAssignment(ctx),
      "Hanya admin yang dapat mendaftarkan template.",
    );

    const input = z
      .object({
        name: z.string().trim().min(1, "Nama template wajib diisi.").max(100),
        owner: z.string().trim().min(1, "Owner wajib diisi.").max(39),
        repo: z.string().trim().min(1, "Nama repo wajib diisi.").max(100),
        description: z.string().trim().max(500).optional(),
      })
      .parse({
        name: formData.get("name"),
        owner: formData.get("owner"),
        repo: formData.get("repo"),
        description: formData.get("description") || undefined,
      });

    if (!isValidGitHubLogin(input.owner)) {
      throw new Error("Owner GitHub tidak valid.");
    }
    if (!/^[A-Za-z0-9._-]+$/.test(input.repo)) {
      throw new Error("Nama repository GitHub tidak valid.");
    }

    await createTemplate({
      name: input.name,
      owner: input.owner,
      repo: input.repo,
      description: input.description ?? null,
    });
  });

  revalidatePath("/admin");
  revalidatePath("/templates");
  redirect(withResult("/templates", message));
}

/** Menyunting metadata template. Owner/repo tidak diubah di sini. */
export async function updateTemplateAction(formData: FormData) {
  const templateId = String(formData.get("templateId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(
      canManageAssignment(ctx),
      "Hanya admin yang dapat mengubah template.",
    );

    const input = z
      .object({
        templateId: uuid,
        name: z.string().trim().min(1, "Nama template wajib diisi.").max(100),
        description: z.string().trim().max(500).optional(),
      })
      .parse({
        templateId,
        name: formData.get("name"),
        description: formData.get("description") || undefined,
      });

    await updateTemplate(input.templateId, {
      name: input.name,
      description: input.description ?? null,
    });
  });

  revalidatePath("/templates");
  redirect(withResult(`/templates/${templateId}`, message));
}

/**
 * Menghapus pendaftaran template dari aplikasi.
 *
 * PENTING: repository GitHub fisiknya tidak pernah ikut terhapus — yang
 * dihapus hanya catatan di database aplikasi.
 *
 * Penghapusan ditolak selama masih ada tugas aktif yang memakainya, dengan
 * menyebut tugas mana saja, supaya penyediaan repository tidak diam-diam rusak.
 */
export async function deleteTemplateAction(formData: FormData) {
  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(
      canManageAssignment(ctx),
      "Hanya admin yang dapat menghapus template.",
    );

    const id = uuid.parse(String(formData.get("templateId") ?? ""));

    const template = await getTemplate(id);
    if (!template) throw new Error("Template tidak ditemukan.");

    const dependents = await listAssignmentsUsingTemplate(id);
    if (!canDeleteTemplate(dependents)) {
      throw new Error(describeTemplateDependents(dependents));
    }

    await deleteTemplate(id);
  });

  revalidatePath("/templates");
  revalidatePath("/admin");
  redirect(withResult("/templates", message));
}
