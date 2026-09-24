import { NextRequest } from "next/server";
import { getCourse, getClass } from "@/lib/db/courses";
import { requireAccessContext } from "@/lib/auth/authorize";
import { canViewClass } from "@/lib/auth/policy";
import { loadClassGradebook } from "@/lib/views/gradebook";

export const dynamic = "force-dynamic";

function escapeCell(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function scoreValue(value: number | null): string {
  return value === null ? "" : String(value);
}

export async function GET(request: NextRequest) {
  const ctx = await requireAccessContext();
  if (ctx.user.role === "STUDENT") {
    return new Response("Forbidden", { status: 403 });
  }

  const courseId = request.nextUrl.searchParams.get("courseId") ?? "";
  const classId = request.nextUrl.searchParams.get("classId") ?? "";
  const [course, klass] = await Promise.all([getCourse(courseId), getClass(classId)]);
  if (!course || !klass || klass.course_id !== course.id || !canViewClass(ctx, klass.id)) {
    return new Response("Forbidden", { status: 403 });
  }

  const gradebook = await loadClassGradebook({ course, klass });
  const header = ["NIM/GitHub", "Nama", ...gradebook.assignments.map((assignment) => `Pertemuan ${assignment.meeting_number} - ${assignment.title}`), "Rata-rata"];
  const body = gradebook.rows.map((row) => [
    row.user.github_login,
    row.user.display_name ?? row.user.github_login,
    ...row.scores.map(scoreValue),
    scoreValue(row.average),
  ]);
  const table = [header, ...body]
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<html><head><meta charset="utf-8"></head><body><table>${table}</table></body></html>`;
  const filename = `pembukuan-${klass.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "kelas"}.xls`;

  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
