import type { UserRole } from "@/lib/db/types";

/**
 * Filter tab pada halaman /users.
 *
 * Dipisah dari komponen halaman supaya bisa diuji langsung dan supaya nilai
 * dari query string tidak pernah dipakai apa adanya sebagai filter database.
 */

export const USER_TABS = [
  "ALL",
  "STUDENT",
  "ASSISTANT",
  "SUPER_ADMIN",
] as const;

export type UserTab = (typeof USER_TABS)[number];

/** Nilai asing dari query string jatuh ke ALL, tidak pernah diteruskan mentah. */
export function parseUserTab(value: string | undefined | null): UserTab {
  return USER_TABS.includes(value as UserTab) ? (value as UserTab) : "ALL";
}

/** ALL berarti tanpa penyaringan role; selain itu tepat satu role. */
export function tabToRoleFilter(tab: UserTab): UserRole | undefined {
  return tab === "ALL" ? undefined : tab;
}
