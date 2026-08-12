import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import { isSuperAdmin } from "@/lib/auth/policy";
import { listAllCourses, listCoursesByIds } from "@/lib/db/courses";
import { Shell } from "@/components/shell";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const user = await requireUser();
  const ctx = await loadAccessContext(user);

  // Mahasiswa/asisten hanya melihat course yang diikutinya.
  const courses = isSuperAdmin(ctx)
    ? await listAllCourses()
    : await listCoursesByIds([
        ...new Set(ctx.memberships.map((m) => m.course_id)),
      ]);

  return (
    <Shell user={user}>
      <PageHeader
        title="Mata Kuliah"
        subtitle="Daftar mata kuliah praktikum yang dapat Anda akses."
      />

      <Card>
        {courses.length === 0 ? (
          <Empty>
            Belum ada mata kuliah yang terkait dengan akun Anda. Hubungi asisten
            atau admin.
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {courses.map((course) => (
              <li key={course.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/courses/${course.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {course.name}
                </Link>
                <p className="text-sm text-slate-600">
                  {course.term ?? "—"}
                  {course.description ? ` · ${course.description}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
