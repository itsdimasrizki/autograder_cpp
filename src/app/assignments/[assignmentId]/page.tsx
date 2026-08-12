import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import {
  canManageAssignment,
  canViewAssignment,
  canViewClass,
  isAssistantOfCourse,
  isSuperAdmin,
} from "@/lib/auth/policy";
import { getAssignment, getTemplate } from "@/lib/db/assignments";
import { getCourse, listClasses, listClassMembers } from "@/lib/db/courses";
import { listRepositoriesForAssignment } from "@/lib/db/repositories";
import { listSubmissions } from "@/lib/db/submissions";
import { summarizeClass } from "@/lib/grading/gradebook";
import { buildStudentOverview } from "@/lib/views/student-overview";
import { togglePublishAction } from "@/lib/actions/assignments";
import { provisionClassAction } from "@/lib/actions/repositories";
import { refreshClassAction, refreshStudentAction } from "@/lib/actions/grading";
import { Shell } from "@/components/shell";
import { Forbidden } from "@/components/forbidden";
import { AssignmentCards } from "@/components/assignment-cards";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  PageHeader,
  Table,
  Td,
  formatDate,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ classId?: string; error?: string }>;
}) {
  const { assignmentId } = await params;
  const { classId, error } = await searchParams;

  const user = await requireUser();
  const ctx = await loadAccessContext(user);

  const assignment = await getAssignment(assignmentId);
  if (!assignment) notFound();
  if (!canViewAssignment(ctx, assignment)) return <Forbidden user={user} />;

  const course = await getCourse(assignment.course_id);
  const template = assignment.template_id
    ? await getTemplate(assignment.template_id)
    : null;

  const isStaff =
    isSuperAdmin(ctx) || isAssistantOfCourse(ctx, assignment.course_id);

  const header = (
    <PageHeader
      title={assignment.title}
      subtitle={
        <>
          Pertemuan {assignment.meeting_number} · {course?.name ?? ""} · Nilai
          maksimal {assignment.max_score} · Mode{" "}
          {assignment.scoring_mode === "BEST" ? "terbaik" : "terakhir"}
          {assignment.deadline
            ? ` · Tenggat ${formatDate(assignment.deadline)}`
            : ""}
        </>
      }
      action={
        canManageAssignment(ctx) ? (
          <form action={togglePublishAction}>
            <input type="hidden" name="assignmentId" value={assignment.id} />
            <Button type="submit" variant="secondary">
              {assignment.published ? "Tarik dari mahasiswa" : "Terbitkan"}
            </Button>
          </form>
        ) : undefined
      }
    />
  );

  const errorNote = error ? (
    <div className="mb-4">
      <ErrorNote>{error}</ErrorNote>
    </div>
  ) : null;

  // ---------------------------------------------------------------------------
  // Tampilan mahasiswa: hanya datanya sendiri.
  // ---------------------------------------------------------------------------
  if (!isStaff) {
    const [view] = await buildStudentOverview({
      ctx,
      userId: user.id,
      courseIds: [assignment.course_id],
    }).then((items) =>
      items.filter((item) => item.assignment.id === assignment.id),
    );

    return (
      <Shell user={user}>
        {header}
        {errorNote}

        {assignment.description && (
          <div className="mb-6">
            <Card title="Deskripsi">
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {assignment.description}
              </p>
            </Card>
          </div>
        )}

        <div className="space-y-6">
          <Card
            title="Status Saya"
            action={
              <form action={refreshStudentAction}>
                <input
                  type="hidden"
                  name="assignmentId"
                  value={assignment.id}
                />
                <input type="hidden" name="userId" value={user.id} />
                <input
                  type="hidden"
                  name="redirectTo"
                  value={`/assignments/${assignment.id}`}
                />
                <Button type="submit" variant="secondary">
                  Segarkan hasil
                </Button>
              </form>
            }
          >
            {view ? (
              <AssignmentCards items={[view]} />
            ) : (
              <Empty>Belum ada data untuk tugas ini.</Empty>
            )}
          </Card>

          <Card title="Riwayat Percobaan">
            {!view || view.history.length === 0 ? (
              <Empty>
                Belum ada percobaan. Dorong (push) kode ke repository Anda untuk
                memulai penilaian otomatis.
              </Empty>
            ) : (
              <Table
                head={["#", "Waktu", "Commit", "Status", "Nilai", "Test", ""]}
              >
                {view.history.map((submission, index) => (
                  <tr key={submission.id}>
                    <Td className="text-slate-500">{index + 1}</Td>
                    <Td>{formatDate(submission.submitted_at)}</Td>
                    <Td className="font-mono text-xs">
                      {submission.commit_sha.slice(0, 7)}
                    </Td>
                    <Td>
                      <Badge value={submission.status} />
                    </Td>
                    <Td className="font-medium">{submission.score ?? "—"}</Td>
                    <Td>
                      {submission.passed_tests ?? "—"} /{" "}
                      {submission.total_tests ?? "—"}
                    </Td>
                    <Td>
                      {submission.html_url && (
                        <a
                          href={submission.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-slate-700 underline"
                        >
                          Log
                        </a>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------------------
  // Tampilan asisten/admin: gradebook per kelas.
  // ---------------------------------------------------------------------------
  const allClasses = await listClasses(assignment.course_id);
  const visibleClasses = allClasses.filter((klass) =>
    canViewClass(ctx, klass.id),
  );

  // classId dari URL selalu diverifikasi ulang terhadap hak akses.
  const selectedClass =
    (classId && visibleClasses.find((klass) => klass.id === classId)) ||
    visibleClasses[0];

  const members = selectedClass
    ? await listClassMembers(selectedClass.id, "STUDENT")
    : [];
  const userIds = members.map((member) => member.user.id);

  const [submissions, repositories] = await Promise.all([
    listSubmissions({ assignmentId: assignment.id, userIds }),
    listRepositoriesForAssignment(assignment.id),
  ]);

  const summaries = summarizeClass(
    userIds,
    submissions,
    assignment.scoring_mode,
  );

  return (
    <Shell user={user}>
      {header}
      {errorNote}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {visibleClasses.map((klass) => (
          <Link
            key={klass.id}
            href={`/assignments/${assignment.id}?classId=${klass.id}`}
            className={`rounded border px-3 py-1.5 text-sm ${
              selectedClass?.id === klass.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {klass.name}
          </Link>
        ))}
      </div>

      {!template && (
        <div className="mb-4">
          <ErrorNote>
            Tugas ini belum memiliki repository template, sehingga repository
            mahasiswa belum dapat disediakan.
          </ErrorNote>
        </div>
      )}

      {selectedClass ? (
        <Card
          title={`Gradebook — ${selectedClass.name}`}
          action={
            <div className="flex flex-wrap gap-2">
              <form action={provisionClassAction}>
                <input
                  type="hidden"
                  name="assignmentId"
                  value={assignment.id}
                />
                <input
                  type="hidden"
                  name="classId"
                  value={selectedClass.id}
                />
                <Button type="submit" variant="secondary">
                  Sediakan repository sekelas
                </Button>
              </form>
              <form action={refreshClassAction}>
                <input
                  type="hidden"
                  name="assignmentId"
                  value={assignment.id}
                />
                <input
                  type="hidden"
                  name="classId"
                  value={selectedClass.id}
                />
                <Button type="submit" variant="secondary">
                  Segarkan nilai
                </Button>
              </form>
            </div>
          }
        >
          {members.length === 0 ? (
            <Empty>Belum ada mahasiswa di kelas ini.</Empty>
          ) : (
            <Table
              head={[
                "Mahasiswa",
                "GitHub",
                "Repository",
                "Status",
                "Nilai",
                "Percobaan",
                "Pengumpulan Terakhir",
              ]}
            >
              {members.map((member) => {
                const summary = summaries.find(
                  (item) => item.userId === member.user.id,
                )!;
                const repository = repositories.find(
                  (item) => item.user_id === member.user.id,
                );

                return (
                  <tr key={member.user.id}>
                    <Td>
                      <Link
                        href={`/students/${member.user.id}?assignmentId=${assignment.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {member.user.display_name ?? member.user.github_login}
                      </Link>
                    </Td>
                    <Td className="text-slate-600">
                      @{member.user.github_login}
                    </Td>
                    <Td>
                      {repository?.html_url ? (
                        <a
                          href={repository.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline"
                        >
                          Buka
                        </a>
                      ) : (
                        <Badge value={repository?.status ?? "PENDING"} />
                      )}
                    </Td>
                    <Td>
                      <Badge
                        value={
                          summary.status === "NOT_SUBMITTED"
                            ? "PENDING"
                            : summary.status
                        }
                      />
                    </Td>
                    <Td className="font-medium">
                      {summary.effectiveScore ?? "—"}
                    </Td>
                    <Td>{summary.attempts}</Td>
                    <Td>{formatDate(summary.lastSubmittedAt)}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          <Empty>Tidak ada kelas yang dapat Anda akses pada tugas ini.</Empty>
        </Card>
      )}
    </Shell>
  );
}
