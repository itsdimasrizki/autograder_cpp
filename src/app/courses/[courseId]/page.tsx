import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import {
  canManageCourse,
  canViewCourse,
  isMemberOfClass,
  isSuperAdmin,
} from "@/lib/auth/policy";
import {
  countStudentsByClass,
  getCourse,
  listClasses,
} from "@/lib/db/courses";
import { createClassAction } from "@/lib/actions/courses";
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
import { Forbidden } from "@/components/forbidden";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { courseId } = await params;
  const { error } = await searchParams;

  const user = await requireUser();
  const ctx = await loadAccessContext(user);

  const course = await getCourse(courseId);
  if (!course) notFound();
  if (!canViewCourse(ctx, course.id)) return <Forbidden user={user} />;

  const allClasses = await listClasses(course.id);
  // Asisten hanya melihat kelas yang ditugaskan kepadanya; mahasiswa hanya
  // melihat kelasnya sendiri.
  const classes = isSuperAdmin(ctx)
    ? allClasses
    : allClasses.filter((klass) => isMemberOfClass(ctx, klass.id));

  const counts = await countStudentsByClass(course.id);

  return (
    <Shell user={user}>
      <PageHeader
        title={course.name}
        subtitle={course.term ?? undefined}
        action={
          <Link
            href={`/courses/${course.id}/assignments`}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Lihat Tugas
          </Link>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Kelas">
            {classes.length === 0 ? (
              <Empty>Belum ada kelas yang dapat Anda akses.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {classes.map((klass) => (
                  <li
                    key={klass.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/classes/${klass.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {klass.name}
                    </Link>
                    <span className="text-sm text-slate-600">
                      {counts[klass.id] ?? 0} mahasiswa
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canManageCourse(ctx) && (
          <Card title="Tambah Kelas">
            <form action={createClassAction} className="space-y-3">
              <input type="hidden" name="courseId" value={course.id} />
              <Field label="Nama kelas" hint="Contoh: Kelas A">
                <input
                  name="name"
                  required
                  maxLength={50}
                  className={inputClass}
                  placeholder="Kelas A"
                />
              </Field>
              <Button type="submit">Tambah</Button>
            </form>
          </Card>
        )}
      </div>
    </Shell>
  );
}
