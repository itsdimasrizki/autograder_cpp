import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext, membershipsOf } from "@/lib/auth/authorize";
import { canViewStudentData } from "@/lib/auth/policy";
import { findUserById } from "@/lib/db/users";
import { listTestResults } from "@/lib/db/submissions";
import { buildStudentOverview } from "@/lib/views/student-overview";
import { ATTEMPT_EXCLUSION_LABEL } from "@/lib/grading/gradebook";
import { provisionOneAction } from "@/lib/actions/repositories";
import { refreshStudentAction } from "@/lib/actions/grading";
import { Shell } from "@/components/shell";
import { Forbidden } from "@/components/forbidden";
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

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ assignmentId?: string; error?: string }>;
}) {
  const { studentId } = await params;
  const { assignmentId, error } = await searchParams;

  const user = await requireUser();
  const ctx = await loadAccessContext(user);

  const student = await findUserById(studentId);
  if (!student) notFound();

  // Inti pencegahan IDOR: akses diputuskan dari keanggotaan kelas mahasiswa
  // yang dituju, bukan dari parameter URL.
  const studentMemberships = await membershipsOf(student.id);
  if (!canViewStudentData(ctx, student.id, studentMemberships)) {
    return <Forbidden user={user} />;
  }

  const courseIds = [
    ...new Set(studentMemberships.map((membership) => membership.course_id)),
  ];
  const overview = await buildStudentOverview({
    ctx,
    userId: student.id,
    courseIds,
  });

  const selected =
    overview.find((item) => item.assignment.id === assignmentId) ?? overview[0];

  // Rincian test dari percobaan terakhir yang punya hasil.
  const lastScored = selected?.attempts
    .map((attempt) => attempt.submission)
    .filter((submission) => submission.total_tests !== null)
    .at(-1);
  const testResults = lastScored ? await listTestResults(lastScored.id) : [];

  return (
    <Shell user={user}>
      <PageHeader
        title={student.display_name ?? student.github_login}
        subtitle={`@${student.github_login}`}
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        <Card title="Ringkasan Seluruh Tugas">
          {overview.length === 0 ? (
            <Empty>Mahasiswa ini belum memiliki tugas.</Empty>
          ) : (
            <Table
              head={[
                "Pertemuan",
                "Tugas",
                "Nilai berlaku",
                "Terbaik",
                "Terakhir",
                "Percobaan",
                "Riwayat",
              ]}
            >
              {overview.map((item) => (
                <tr key={item.assignment.id}>
                  <Td className="text-slate-500">
                    {item.assignment.meeting_number}
                  </Td>
                  <Td>
                    <a
                      href={`/students/${student.id}?assignmentId=${item.assignment.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {item.assignment.title}
                    </a>
                  </Td>
                  <Td className="font-medium">
                    {item.summary.effectiveScore ?? "—"}
                    {item.summary.effectiveLate && (
                      <span className="ml-1 text-xs font-normal text-amber-700">
                        terlambat
                      </span>
                    )}
                  </Td>
                  <Td>{item.summary.bestScore ?? "—"}</Td>
                  <Td>{item.summary.latestScore ?? "—"}</Td>
                  <Td>
                    {item.summary.attempts}
                    {item.summary.attempts !== item.summary.countedAttempts && (
                      <span className="ml-1 text-xs text-slate-500">
                        ({item.summary.countedAttempts} dihitung)
                      </span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{item.trail}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {selected && (
          <Card
            title={`Riwayat — ${selected.assignment.title}`}
            action={
              <div className="flex flex-wrap gap-2">
                <form action={provisionOneAction}>
                  <input
                    type="hidden"
                    name="assignmentId"
                    value={selected.assignment.id}
                  />
                  <input type="hidden" name="userId" value={student.id} />
                  <Button type="submit" variant="secondary">
                    Sediakan repository
                  </Button>
                </form>
                <form action={refreshStudentAction}>
                  <input
                    type="hidden"
                    name="assignmentId"
                    value={selected.assignment.id}
                  />
                  <input type="hidden" name="userId" value={student.id} />
                  <input
                    type="hidden"
                    name="redirectTo"
                    value={`/students/${student.id}?assignmentId=${selected.assignment.id}`}
                  />
                  <Button type="submit" variant="secondary">
                    Segarkan hasil
                  </Button>
                </form>
              </div>
            }
          >
            {selected.repository?.provision_error && (
              <div className="mb-3">
                <ErrorNote>
                  Penyediaan repository gagal: {selected.repository.provision_error}
                </ErrorNote>
              </div>
            )}

            {selected.attempts.length === 0 ? (
              <Empty>Belum ada percobaan pengumpulan.</Empty>
            ) : (
              <Table
                head={["#", "Waktu", "Commit", "Status", "Nilai", "Test", ""]}
              >
                {selected.attempts.map((attempt, index) => (
                  <tr key={attempt.submission.id}>
                    <Td className="text-slate-500">{index + 1}</Td>
                    <Td>{formatDate(attempt.submission.submitted_at)}</Td>
                    <Td className="font-mono text-xs">
                      {attempt.submission.commit_sha.slice(0, 7)}
                    </Td>
                    <Td>
                      <Badge value={attempt.submission.status} />
                    </Td>
                    <Td
                      className={
                        attempt.eligible
                          ? "font-medium"
                          : "text-slate-400 line-through"
                      }
                    >
                      {attempt.submission.score ?? "—"}
                      {attempt.exclusion &&
                        attempt.exclusion !== "BELUM_DINILAI" && (
                          <span className="ml-1 text-xs text-slate-500 no-underline">
                            {ATTEMPT_EXCLUSION_LABEL[attempt.exclusion]}
                          </span>
                        )}
                      {attempt.late && (
                        <span className="ml-1 text-xs text-amber-700 no-underline">
                          terlambat
                        </span>
                      )}
                    </Td>
                    <Td>
                      {attempt.submission.passed_tests ?? "—"} /{" "}
                      {attempt.submission.total_tests ?? "—"}
                    </Td>
                    <Td>
                      {attempt.submission.html_url && (
                        <a
                          href={attempt.submission.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline"
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
        )}

        {testResults.length > 0 && (
          <Card title="Rincian Test (percobaan terakhir yang dinilai)">
            <Table head={["Test", "Status", "Poin", "Keterangan"]}>
              {testResults.map((test) => (
                <tr key={test.id}>
                  <Td>{test.name}</Td>
                  <Td>
                    <Badge value={test.status} />
                  </Td>
                  <Td>{Number(test.points).toFixed(2)}</Td>
                  <Td className="text-slate-600">{test.message ?? ""}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </Shell>
  );
}
