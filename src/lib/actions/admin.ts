"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import { assert, canChangeRole } from "@/lib/auth/policy";
import { findUserById, logRoleChange, setUserRole } from "@/lib/db/users";
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
