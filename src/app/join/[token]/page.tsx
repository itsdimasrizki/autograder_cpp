import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import { isMemberOfClass } from "@/lib/auth/policy";
import {
  isWellFormedJoinToken,
  joinLinkStatus,
} from "@/lib/auth/join-token";
import { findJoinLinkByToken } from "@/lib/db/join-links";
import { getClass, getCourse } from "@/lib/db/courses";
import { joinClassAction } from "@/lib/actions/join";
import { Shell } from "@/components/shell";
import { Button, Card, ErrorNote } from "@/components/ui";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

/** Kartu sederhana untuk pengunjung yang belum masuk. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Logo className="h-6 w-6 shrink-0 text-slate-900" />
          Praktikum Struktur Data
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const user = await getCurrentUser();

  // Token yang bentuknya salah ditolak tanpa menyentuh database.
  const link = isWellFormedJoinToken(token)
    ? await findJoinLinkByToken(token)
    : null;
  const status = link ? joinLinkStatus(link) : null;

  // Pesan sengaja sama untuk token tidak dikenal maupun bentuk yang salah,
  // supaya tautan tidak bisa ditebak lewat perbedaan respons.
  if (!link || status !== "AKTIF") {
    const reason =
      status === "DICABUT"
        ? "Tautan undangan ini sudah dicabut oleh asisten."
        : status === "KEDALUWARSA"
          ? "Tautan undangan ini sudah kedaluwarsa."
          : "Tautan undangan tidak valid.";

    const body = (
      <>
        <h1 className="text-lg font-semibold text-slate-900">
          Tautan tidak dapat dipakai
        </h1>
        <p className="mt-2 text-sm text-slate-600">{reason}</p>
        <p className="mt-1 text-sm text-slate-600">
          Minta tautan baru kepada asisten praktikum Anda.
        </p>
        <Link
          href={user ? "/dashboard" : "/login"}
          className="mt-4 inline-block text-sm text-slate-900 underline"
        >
          {user ? "Kembali ke dasbor" : "Ke halaman masuk"}
        </Link>
      </>
    );

    return user ? (
      <Shell user={user}>
        <Card>{body}</Card>
      </Shell>
    ) : (
      <Panel>{body}</Panel>
    );
  }

  const [klass, course] = await Promise.all([
    getClass(link.class_id),
    getCourse(link.course_id),
  ]);
  const label = `${klass?.name ?? "Kelas"} — ${course?.name ?? ""}`;

  // Belum masuk: arahkan ke GitHub, lalu kembali ke halaman ini.
  if (!user) {
    return (
      <Panel>
        <h1 className="text-lg font-semibold text-slate-900">
          Gabung {label}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Masuk dengan akun GitHub Anda untuk bergabung. Anda akan kembali ke
          halaman ini setelah login.
        </p>
        <a
          href={`/api/auth/github?next=${encodeURIComponent(`/join/${token}`)}`}
          className="mt-5 flex w-full items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Masuk dengan GitHub
        </a>
        <p className="mt-4 text-xs text-slate-500">
          Anda tidak perlu menjadi anggota organisasi GitHub mana pun.
        </p>
      </Panel>
    );
  }

  const ctx = await loadAccessContext(user);
  const alreadyMember = isMemberOfClass(ctx, link.class_id);

  return (
    <Shell user={user}>
      <Card title="Gabung Kelas">
        {error && (
          <div className="mb-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        <p className="text-sm text-slate-700">
          Anda akan bergabung ke <strong>{label}</strong> sebagai mahasiswa,
          memakai akun GitHub <strong>@{user.github_login}</strong>.
        </p>

        {alreadyMember ? (
          <p className="mt-3 text-sm text-slate-600">
            Anda sudah terdaftar di kelas ini.{" "}
            <Link href="/dashboard" className="underline">
              Buka dasbor
            </Link>
            .
          </p>
        ) : (
          <form action={joinClassAction} className="mt-4">
            <input type="hidden" name="token" value={token} />
            <Button type="submit">Gabung Kelas</Button>
          </form>
        )}
      </Card>
    </Shell>
  );
}
