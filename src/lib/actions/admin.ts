"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAccessContext } from "@/lib/auth/authorize";
import { assert, isSuperAdmin } from "@/lib/auth/policy";
import { setUserRole } from "@/lib/db/users";
import { runAction, withResult } from "@/lib/actions/result";

/**
 * Perubahan role hanya boleh dilakukan SUPER_ADMIN, di sisi server.
 * Browser tidak pernah mengirim role untuk dirinya sendiri.
 */
export async function setRoleAction(formData: FormData) {
  const message = await runAction(async () => {
    const ctx = await requireAccessContext();
    assert(isSuperAdmin(ctx), "Hanya admin yang dapat mengubah role.");

    const input = z
      .object({
        userId: z.string().uuid("ID pengguna tidak valid."),
        role: z.enum(["SUPER_ADMIN", "ASSISTANT", "STUDENT"]),
      })
      .parse({ userId: formData.get("userId"), role: formData.get("role") });

    // Mencegah admin terakhir mengunci dirinya sendiri secara tidak sengaja.
    if (input.userId === ctx.user.id && input.role !== "SUPER_ADMIN") {
      throw new Error("Anda tidak dapat menurunkan role Anda sendiri.");
    }

    await setUserRole(input.userId, input.role);
  });

  revalidatePath("/admin");
  redirect(withResult("/admin", message));
}
