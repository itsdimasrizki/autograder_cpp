import Link from "next/link";
import { requireRole } from "@/lib/auth/current-user";
import { listAllCourses, listClasses } from "@/lib/db/courses";
import { listTemplates } from "@/lib/db/assignments";
import { listUsers } from "@/lib/db/users";
import { createCourseAction } from "@/lib/actions/courses";
import { createTemplateAction } from "@/lib/actions/assignments";
import { setRoleAction } from "@/lib/actions/admin";
import { Shell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  PageHeader,
  Table,
  Td,
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

  const [courses, templates, users] = await Promise.all([
    listAllCourses(),
    listTemplates(),
    listUsers(),
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

          <Card title="Daftarkan Repository Template">
            <form action={createTemplateAction} className="space-y-3">
              <Field label="Nama template">
                <input
                  name="name"
                  required
                  className={inputClass}
                  placeholder="Praktikum 01 Template"
                />
              </Field>
              <Field label="Owner (organisasi/pengguna GitHub)">
                <input
                  name="owner"
                  required
                  className={inputClass}
                  placeholder="nama-organisasi"
                />
              </Field>
              <Field
                label="Nama repository"
                hint="Repository harus ditandai sebagai Template di GitHub."
              >
                <input
                  name="repo"
                  required
                  className={inputClass}
                  placeholder="praktikum-01-template"
                />
              </Field>
              <Button type="submit">Daftarkan</Button>
            </form>

            {templates.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-slate-700">
                {templates.map((template) => (
                  <li key={template.id}>
                    {template.name}{" "}
                    <span className="font-mono text-xs text-slate-500">
                      {template.owner}/{template.repo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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

        <Card title="Pengguna">
          <Table head={["Nama", "GitHub", "Role", "Ubah role"]}>
            {users.map((row) => (
              <tr key={row.id}>
                <Td>{row.display_name ?? row.github_login}</Td>
                <Td className="text-slate-600">@{row.github_login}</Td>
                <Td>
                  <Badge value={row.role} />
                </Td>
                <Td>
                  <form action={setRoleAction} className="flex gap-2">
                    <input type="hidden" name="userId" value={row.id} />
                    <select
                      name="role"
                      defaultValue={row.role}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="STUDENT">STUDENT</option>
                      <option value="ASSISTANT">ASSISTANT</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    </select>
                    <Button type="submit" variant="secondary">
                      Simpan
                    </Button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </Shell>
  );
}
