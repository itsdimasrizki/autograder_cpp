"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import { assert, canManageJoinLink } from "@/lib/auth/policy";
import {
  generateJoinToken,
  isJoinLinkUsable,
  isWellFormedJoinToken,
} from "@/lib/auth/join-token";
import {
  createJoinLink,
  findJoinLinkByToken,
  revokeJoinLinksOfClass,
} from "@/lib/db/join-links";
import { addMember, getClass } from "@/lib/db/courses";
import { runAction, withResult } from "@/lib/actions/result";

const uuid = z.string().uuid("ID tidak valid.");

/**
 * Membuat tautan undangan baru untuk sebuah kelas.
 *
 * Tautan lama otomatis dicabut (lihat createJoinLink), sehingga tombol
 * "Buat ulang" sekaligus berfungsi sebagai pencabutan tautan sebelumnya.
 *
 * Token asli hanya ditampilkan lewat halaman kelas setelah redirect; yang
 * tersimpan di database hanya hash-nya.
 */
export async function generateJoinLinkAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  // redirect() melempar error khusus Next; kalau dipanggil di dalam runAction
  // error itu ikut tertangkap. Token karena itu dibawa keluar lewat variabel.
  let issuedToken: string | null = null;

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({
        classId: uuid,
        // Kosong = tanpa kedaluwarsa.
        expiresInDays: z
          .union([z.coerce.number().int().min(1).max(365), z.literal("")])
          .optional(),
      })
      .parse({
        classId,
        expiresInDays: formData.get("expiresInDays") || undefined,
      });

    // Otorisasi dievaluasi terhadap kelas yang diminta, bukan terhadap
    // course_id kiriman browser (mencegah IDOR).
    assert(
      canManageJoinLink(ctx, input.classId),
      "Anda tidak berhak membuat tautan undangan untuk kelas ini.",
    );

    const klass = await getClass(input.classId);
    if (!klass) throw new Error("Kelas tidak ditemukan.");

    const expiresAt =
      typeof input.expiresInDays === "number"
        ? new Date(
            Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
          ).toISOString()
        : null;

    const token = generateJoinToken();
    await createJoinLink({
      classId: klass.id,
      courseId: klass.course_id,
      token,
      createdBy: ctx.user.id,
      expiresAt,
    });

    issuedToken = token;
  });

  revalidatePath(`/classes/${classId}`);

  // Token dikirim lewat query supaya asisten bisa menyalinnya. Ini satu-satunya
  // kesempatan menampilkannya — database hanya menyimpan hash.
  if (issuedToken) {
    redirect(
      `/classes/${classId}?token=${encodeURIComponent(issuedToken)}`,
    );
  }
  redirect(withResult(`/classes/${classId}`, message));
}

export async function revokeJoinLinkAction(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    const input = z.object({ classId: uuid }).parse({ classId });

    assert(
      canManageJoinLink(ctx, input.classId),
      "Anda tidak berhak mencabut tautan undangan kelas ini.",
    );

    await revokeJoinLinksOfClass(input.classId, ctx.user.id);
  });

  revalidatePath(`/classes/${classId}`);
  redirect(withResult(`/classes/${classId}`, message ?? "Tautan dicabut."));
}

/**
 * Mahasiswa bergabung ke kelas memakai token undangan.
 *
 * Keamanan:
 *   - class_id TIDAK diambil dari form; diturunkan dari baris yang cocok
 *     dengan hash token, jadi token kelas A tidak bisa memasukkan siapa pun
 *     ke kelas B;
 *   - role selalu STUDENT, tidak pernah dari input;
 *   - idempoten: bergabung dua kali ke kelas yang sama tidak menduplikasi
 *     keanggotaan (addMember mengembalikan baris yang sudah ada).
 */
export async function joinClassAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  let joined = false;

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    if (!isWellFormedJoinToken(token)) {
      throw new Error("Tautan undangan tidak valid.");
    }

    const link = await findJoinLinkByToken(token);
    if (!link) throw new Error("Tautan undangan tidak valid.");
    if (!isJoinLinkUsable(link)) {
      throw new Error(
        link.revoked_at
          ? "Tautan undangan ini sudah dicabut. Minta tautan baru ke asisten."
          : "Tautan undangan ini sudah kedaluwarsa. Minta tautan baru ke asisten.",
      );
    }

    await addMember({
      courseId: link.course_id,
      classId: link.class_id,
      userId: ctx.user.id,
      role: "STUDENT",
    });

    joined = true;
  });

  revalidatePath("/dashboard");
  if (joined) redirect("/dashboard");
  redirect(withResult(`/join/${encodeURIComponent(token)}`, message));
}
