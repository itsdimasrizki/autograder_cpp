import Link from "next/link";
import { requireRole } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import { canViewClass, isSuperAdmin } from "@/lib/auth/policy";
import { listCoursesByIds, listAllCourses, listClasses } from "@/lib/db/courses";
import { loadClassGradebook } from "@/lib/views/gradebook";
import { Shell } from "@/components/shell";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function formatScore(score: number | null): string {
  return score === null ? "—" : Number.isInteger(score) ? String(score) : score.toFixed(2);
}

export default async function GradebookPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; classId?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await requireRole("SUPER_ADMIN", "ASSISTANT");
  const ctx = await loadAccessContext(user);
  const courses = isSuperAdmin(ctx)
    ? await listAllCourses()
    : await listCoursesByIds([...new Set(ctx.memberships.map((item) => item.course_id))]);
  const selectedCourse = courses.find((course) => course.id === params.courseId) ?? courses[0];
  const allClasses = selectedCourse ? await listClasses(selectedCourse.id) : [];
  const visibleClasses = allClasses.filter((klass) => canViewClass(ctx, klass.id));
  const selectedClass =
    visibleClasses.find((klass) => klass.id === params.classId) ?? visibleClasses[0];
  const gradebook =
    selectedCourse && selectedClass
      ? await loadClassGradebook({ course: selectedCourse, klass: selectedClass })
      : null;

  return (
    <Shell user={user}>
      <PageHeader
        title="Pembukuan Nilai Praktikum"
        subtitle="Rekap otomatis per bab atau mata kuliah, kelas, dan pertemuan."
        action={
          gradebook ? (
            <Link
              href={`/api/gradebook/export?courseId=${gradebook.course.id}&classId=${gradebook.klass.id}`}
              className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Export Excel
            </Link>
          ) : undefined
        }
      />

      {params.error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {params.error}
        </p>
      )}

      <Card>
        {courses.length === 0 ? (
          <Empty>Belum ada bab atau mata kuliah yang dapat Anda akses.</Empty>
        ) : (
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-700">Bab / mata kuliah</span>
              <select
                name="courseId"
                defaultValue={selectedCourse?.id}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-700">Kelas</span>
              <select
                name="classId"
                defaultValue={selectedClass?.id}
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {visibleClasses.map((klass) => (
                  <option key={klass.id} value={klass.id}>{klass.name}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Tampilkan
            </button>
          </form>
        )}
      </Card>

      <div className="mt-6">
        {!gradebook ? (
          <Card><Empty>Belum ada kelas yang dapat Anda akses.</Empty></Card>
        ) : gradebook.assignments.length === 0 ? (
          <Card><Empty>Belum ada pertemuan pada bab atau mata kuliah ini.</Empty></Card>
        ) : gradebook.rows.length === 0 ? (
          <Card><Empty>Belum ada mahasiswa di kelas ini.</Empty></Card>
        ) : (
          <Card
            title={`Pembukuan — ${gradebook.klass.name}`}
            action={<span className="text-xs text-slate-500">{gradebook.rows.length} mahasiswa · {gradebook.assignments.length} pertemuan</span>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="sticky left-0 bg-white px-3 py-2 font-medium">Mahasiswa</th>
                    {gradebook.assignments.map((assignment) => (
                      <th key={assignment.id} className="min-w-24 px-3 py-2 text-center font-medium" title={assignment.title}>
                        P{assignment.meeting_number}<span className="block normal-case font-normal text-slate-400">{assignment.title}</span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium">Rata-rata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gradebook.rows.map((row) => (
                    <tr key={row.user.id}>
                      <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-900">
                        <span className="block">{row.user.display_name ?? row.user.github_login}</span>
                        <span className="text-xs font-normal text-slate-500">@{row.user.github_login}</span>
                      </td>
                      {row.scores.map((score, index) => (
                        <td key={gradebook.assignments[index].id} className="px-3 py-2 text-center tabular-nums">
                          {formatScore(score)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-semibold tabular-nums">{formatScore(row.average)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Shell>
  );
}
