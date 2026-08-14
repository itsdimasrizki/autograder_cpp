"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import { assert, canChangeRole, canDeleteUser } from "@/lib/auth/policy";
import {
  countUserFootprint,
  deleteUser,
  findUserById,
  logRoleChange,
  setUserRole,
} from "@/lib/db/users";
import { runAction, safePath, withResult } from "@/lib/actions/result";

/**
 * Perubahan role hanya boleh dilakukan SUPER_ADMIN, di sisi server.
 *
 * Browser tidak pernah menentukan role-nya sendiri: yang dikirim form hanyalah
 * id pengguna sasaran dan role tujuan, lalu keduanya diuji ulang terhadap
 * `canChangeRole` memakai role penyunting yang dibaca dari database.
 */
export async function setRoleAction(formData: FormData) {
  const backTo = safePath(String(formData.get("backTo") ?? ""), "/users");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({
        userId: z.string().uuid("ID pengguna tidak valid."),
        role: z.enum(["SUPER_ADMIN", "ASSISTANT", "STUDENT"]),
      })
      .parse({ userId: formData.get("userId"), role: formData.get("role") });

    const target = await findUserById(input.userId);
    if (!target) throw new Error("Pengguna tidak ditemukan.");

    // Satu pemeriksaan terpusat menutup semua kasus terlarang sekaligus:
    // bukan admin, mengubah diri sendiri, menyentuh SUPER_ADMIN, atau
    // mengangkat orang menjadi SUPER_ADMIN lewat UI.
    assert(
      canChangeRole(ctx, target, input.role),
      target.role === "SUPER_ADMIN"
        ? "Role SUPER_ADMIN tidak dapat diubah lewat halaman ini."
        : input.role === "SUPER_ADMIN"
          ? "SUPER_ADMIN hanya dapat ditetapkan lewat GITHUB_SUPER_ADMINS."
          : ctx.user.id === target.id
            ? "Anda tidak dapat mengubah role Anda sendiri."
            : "Anda tidak berhak mengubah role pengguna.",
    );

    await setUserRole(target.id, input.role);
    await logRoleChange({
      actorUserId: ctx.user.id,
      targetUserId: target.id,
      fromRole: target.role,
      toRole: input.role,
    });
  });

  revalidatePath("/users");
  revalidatePath("/admin");
  redirect(withResult(backTo, message));
}

/**
 * Menghapus permanen sebuah akun pengguna.
 *
 * Ini operasi yang tidak dapat dibatalkan: karena ON DELETE CASCADE, seluruh
 * keanggotaan kelas, catatan repository, dan submission (termasuk nilainya)
 * milik pengguna tersebut ikut terhapus. Repository di GitHub tidak disentuh.
 *
 * Jumlah yang terhapus dicatat ke log server supaya kejadiannya tetap dapat
 * ditelusuri walau barisnya sudah hilang.
 */
export async function deleteUserAction(formData: FormData) {
  const backTo = safePath(String(formData.get("backTo") ?? ""), "/users");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const userId = z
      .string()
      .uuid("ID pengguna tidak valid.")
      .parse(formData.get("userId"));

    const target = await findUserById(userId);
    if (!target) throw new Error("Pengguna tidak ditemukan.");

    assert(
      canDeleteUser(ctx, target),
      target.role === "SUPER_ADMIN"
        ? "Akun SUPER_ADMIN tidak dapat dihapus lewat halaman ini."
        : ctx.user.id === target.id
          ? "Anda tidak dapat menghapus akun Anda sendiri."
          : "Anda tidak berhak menghapus pengguna.",
    );

    const footprint = await countUserFootprint(target.id);
    console.warn(
      `[admin] @${ctx.user.id} menghapus permanen @${target.github_login} ` +
        `(github_user_id ${target.github_user_id}) beserta ` +
        `${footprint.submissions} submission dan ${footprint.repositories} repository.`,
    );

    await deleteUser(target.id);
  });

  revalidatePath("/users");
  revalidatePath("/admin");
  redirect(withResult(backTo, message));
}
