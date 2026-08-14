import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import { isSuperAdmin } from "@/lib/auth/policy";
import { buildStudentOverview } from "@/lib/views/student-overview";
import { getClass, listAllCourses, listCoursesByIds } from "@/lib/db/courses";
import { Shell } from "@/components/shell";
import { AssignmentCards } from "@/components/assignment-cards";
import { Card, Empty, ErrorNote, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const ctx = await loadAccessContext(user);
  const { error } = await searchParams;

  const studentCourseIds = [
    ...new Set(
      ctx.memberships.filter((m) => m.role === "STUDENT").map((m) => m.course_id),
    ),
  ];
  const assistantClassIds = ctx.memberships
    .filter((m) => m.role === "ASSISTANT")
    .map((m) => m.class_id);

  const assistantCourseIds = [
    ...new Set(
      ctx.memberships
        .filter((m) => m.role === "ASSISTANT")
        .map((m) => m.course_id),
    ),
  ];

  // Keempat kelompok query ini tidak saling bergantung — semuanya hanya butuh
  // `ctx` yang sudah ada. Dijalankan berurutan, tiap halaman membayar latensi
  // Supabase empat kali; satu gelombang cukup sekali.
  //
  // Mahasiswa tetap hanya pernah melihat datanya sendiri: penyaringan ada di
  // buildStudentOverview lewat kebijakan terpusat, bukan di sini.
  const [overview, assistantClasses, assistantCourses, adminCourses] =
    await Promise.all([
      studentCourseIds.length > 0
        ? buildStudentOverview({
            ctx,
            userId: user.id,
            courseIds: studentCourseIds,
          })
        : Promise.resolve([]),
      Promise.all(assistantClassIds.map((classId) => getClass(classId))),
      listCoursesByIds(assistantCourseIds),
      isSuperAdmin(ctx) ? listAllCourses() : Promise.resolve([]),
    ]);

  return (
    <Shell user={user}>
      <PageHeader
        title={`Halo, ${user.display_name ?? user.github_login}`}
        subtitle={
          error === "forbidden"
            ? undefined
            : "Ringkasan praktikum yang terkait dengan akun GitHub Anda."
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>
            {error === "forbidden"
              ? "Anda tidak memiliki akses ke halaman tersebut."
              : error}
          </ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        {overview.length > 0 && (
          <Card title="Tugas Praktikum Saya">
            <AssignmentCards items={overview} />
          </Card>
        )}

        {assistantClassIds.length > 0 && (
          <Card title="Kelas yang Saya Asisteni">
            <ul className="divide-y divide-slate-100">
              {assistantClasses.filter(Boolean).map((klass) => (
                <li
                  key={klass!.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/classes/${klass!.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {klass!.name}
                  </Link>
                  <span className="text-sm text-slate-600">
                    {assistantCourses.find((c) => c.id === klass!.course_id)
                      ?.name ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {isSuperAdmin(ctx) && (
          <Card
            title="Mata Kuliah (Admin)"
            action={
              <Link
                href="/admin"
                className="text-sm text-slate-700 hover:underline"
              >
                Kelola
              </Link>
            }
          >
            {adminCourses.length === 0 ? (
              <Empty>Belum ada mata kuliah. Buat lewat halaman Admin.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {adminCourses.map((course) => (
                  <li key={course.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/courses/${course.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {course.name}
                    </Link>{" "}
                    <span className="text-sm text-slate-600">
                      {course.term ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {overview.length === 0 &&
          assistantClassIds.length === 0 &&
          !isSuperAdmin(ctx) && (
            <Card>
              <Empty>
                Akun GitHub Anda (@{user.github_login}) berhasil dikenali,
                tetapi belum terdaftar di kelas mana pun. Minta tautan undangan
                kelas kepada asisten praktikum Anda, lalu buka tautan tersebut
                untuk bergabung.
              </Empty>
            </Card>
          )}
      </div>
    </Shell>
  );
}
