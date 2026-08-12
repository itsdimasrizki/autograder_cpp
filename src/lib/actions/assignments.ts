"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import { assert, canManageAssignment } from "@/lib/auth/policy";
import {
  createAssignment,
  createTemplate,
  getAssignment,
  updateAssignment,
} from "@/lib/db/assignments";
import { isValidGitHubLogin } from "@/lib/github/naming";
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
        scoringMode: z.enum(["BEST", "LATEST"]),
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

  revalidatePath(`/courses/${courseId}/assignments`);
  redirect(withResult(`/courses/${courseId}/assignments`, message));
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
        scoringMode: z.enum(["BEST", "LATEST"]),
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
  redirect(withResult("/admin", message));
}
