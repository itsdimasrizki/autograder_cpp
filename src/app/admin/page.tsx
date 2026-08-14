import Link from "next/link";
import { requireRole } from "@/lib/auth/current-user";
import { listAllCourses, listClasses } from "@/lib/db/courses";
import { listTemplates } from "@/lib/db/assignments";
import { countUsersByRole } from "@/lib/db/users";
import { createCourseAction } from "@/lib/actions/courses";
import { Shell } from "@/components/shell";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  PageHeader,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Otorisasi di sisi server; bukan sekadar menyembunyikan tautan di navigasi.
  const user = await requireRole("SUPER_ADMIN");
  const { error } = await searchParams;

  const [courses, templates, userCounts] = await Promise.all([
    listAllCourses(),
    listTemplates(),
    countUsersByRole(),
  ]);

  const classesByCourse = await Promise.all(
    courses.map(async (course) => ({
      course,
      classes: await listClasses(course.id),
    })),
  );

  return (
    <Shell user={user}>
      <PageHeader
        title="Admin"
        subtitle="Kelola mata kuliah, kelas, template tugas, dan role pengguna."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Buat Mata Kuliah">
            <form action={createCourseAction} className="space-y-3">
              <Field label="Nama">
                <input
                  name="name"
                  required
                  minLength={3}
                  className={inputClass}
                  placeholder="Praktikum Struktur Data"
                />
              </Field>
              <Field label="Tahun / semester">
                <input
                  name="term"
                  className={inputClass}
                  placeholder="2026"
                />
              </Field>
              <Field label="Deskripsi (opsional)">
                <textarea name="description" rows={2} className={inputClass} />
              </Field>
              <Button type="submit">Buat</Button>
            </form>
          </Card>

          <Card
            title="Ringkasan"
            action={
              <Link href="/users" className="text-sm text-slate-700 hover:underline">
                Kelola pengguna
              </Link>
            }
          >
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Mahasiswa</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {userCounts.STUDENT}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Asisten</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {userCounts.ASSISTANT}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Admin</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {userCounts.SUPER_ADMIN}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Template</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {templates.length}
                </dd>
              </div>
            </dl>

            <Link
              href="/templates"
              className="mt-4 inline-block text-sm text-slate-700 hover:underline"
            >
              Kelola repository template →
            </Link>
          </Card>
        </div>

        <Card title="Mata Kuliah & Kelas">
          {courses.length === 0 ? (
            <Empty>Belum ada mata kuliah.</Empty>
          ) : (
            <ul className="space-y-3">
              {classesByCourse.map(({ course, classes }) => (
                <li key={course.id} className="rounded border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/courses/${course.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {course.name} {course.term ? `(${course.term})` : ""}
                    </Link>
                    <Link
                      href={`/courses/${course.id}/assignments`}
                      className="text-sm text-slate-700 hover:underline"
                    >
                      Kelola tugas
                    </Link>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {classes.length === 0 ? (
                      <span className="text-sm text-slate-500">
                        Belum ada kelas.
                      </span>
                    ) : (
                      classes.map((klass) => (
                        <Link
                          key={klass.id}
                          href={`/classes/${klass.id}`}
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {klass.name}
                        </Link>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

      </div>
    </Shell>
  );
}
