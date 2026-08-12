import { AuthorizationError } from "@/lib/auth/policy";
import { ZodError } from "zod";

/**
 * Server action pada aplikasi ini memakai <form action={...}> biasa tanpa
 * JavaScript di sisi klien, lalu melaporkan hasil lewat query string.
 *
 * `runAction` menjalankan pekerjaan dan mengubah error menjadi pesan yang
 * aman ditampilkan. Detail teknis tetap di log server.
 */
export async function runAction(
  work: () => Promise<void>,
): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof AuthorizationError) return error.message;
    if (error instanceof ZodError) {
      return error.issues[0]?.message ?? "Input tidak valid.";
    }
    console.error("[action]", error);
    return error instanceof Error ? error.message : "Terjadi kesalahan.";
  }
}

/**
 * Membatasi tujuan redirect ke path internal.
 *
 * Beberapa action menerima tujuan redirect dari form. Tanpa pembatasan ini,
 * nilai seperti "//situs-lain.example" akan menjadi open redirect.
 */
export function safePath(candidate: string, fallback: string): string {
  if (!candidate.startsWith("/")) return fallback;
  // "//host" dan "/\host" ditafsirkan browser sebagai URL protocol-relative.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  if (candidate.includes("://")) return fallback;
  return candidate;
}

/** Menambahkan pesan hasil ke URL tujuan redirect. */
export function withResult(path: string, message: string | null): string {
  const target = safePath(path, "/dashboard");
  if (!message) return target;
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}error=${encodeURIComponent(message)}`;
}
