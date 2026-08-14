import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ErrorNote } from "@/components/ui";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  state_tidak_valid: "Sesi login kedaluwarsa. Silakan coba lagi.",
  code_tidak_ada: "GitHub tidak mengirim kode otorisasi. Silakan coba lagi.",
  otorisasi_dibatalkan:
    "Otorisasi GitHub dibatalkan. Tekan tombol di bawah untuk mencoba lagi.",
  profil_gagal:
    "Profil GitHub Anda tidak dapat dibaca. Silakan coba lagi beberapa saat.",
  penyimpanan_gagal:
    "Akun Anda tidak dapat disimpan. Tunjukkan pesan ini ke asisten praktikum.",
  login_gagal: "Login gagal. Hubungi asisten bila terus berulang.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");

  const { error, next } = await searchParams;
  const loginHref = next
    ? `/api/auth/github?next=${encodeURIComponent(next)}`
    : "/api/auth/github";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8 shrink-0 text-slate-900" />
          <h1 className="text-lg font-semibold text-slate-900">
            Praktikum Struktur Data
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Masuk memakai akun GitHub yang Anda gunakan untuk mengerjakan
          praktikum.
        </p>

        {error && (
          <div className="mt-4">
            <ErrorNote>{messages[error] ?? "Terjadi kesalahan."}</ErrorNote>
          </div>
        )}

        <a
          href={loginHref}
          className="mt-5 flex w-full items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Masuk dengan GitHub
        </a>

        <p className="mt-4 text-xs text-slate-500">
          Gunakan akun GitHub yang sama setiap semester agar riwayat pengumpulan
          tetap tercatat.
        </p>
      </div>
    </div>
  );
}
