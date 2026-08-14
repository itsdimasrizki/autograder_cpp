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
import {
  getAssignment,
  getTemplate,
  listTemplates,
} from "@/lib/db/assignments";
import { getCourse, listClasses, listClassMembers } from "@/lib/db/courses";
import { listRepositoriesForAssignment } from "@/lib/db/repositories";
import { listSubmissions } from "@/lib/db/submissions";
import { summarizeClass } from "@/lib/grading/gradebook";
import { buildStudentOverview } from "@/lib/views/student-overview";
import {
  deleteAssignmentAction,
  togglePublishAction,
  updateAssignmentAction,
} from "@/lib/actions/assignments";
import { provisionClassAction } from "@/lib/actions/repositories";
import { refreshClassAction, refreshStudentAction } from "@/lib/actions/grading";
import { Shell } from "@/components/shell";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
import { AssignmentCards } from "@/components/assignment-cards";
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
  formatDate,
  inputClass,
} from "@/components/ui";

/** <input type="datetime-local"> butuh "YYYY-MM-DDTHH:mm" waktu lokal. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

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

  const isStaff =
    isSuperAdmin(ctx) || isAssistantOfCourse(ctx, assignment.course_id);
  const canManage = canManageAssignment(ctx);

  // Keempatnya hanya bergantung pada `assignment` dan `ctx` yang sudah ada,
  // jadi diambil dalam satu gelombang. Daftar kelas dan template tetap hanya
  // diambil untuk yang berhak, sehingga tidak ada data yang bocor ke mahasiswa.
  const [course, template, allClasses, templates] = await Promise.all([
    getCourse(assignment.course_id),
    assignment.template_id
      ? getTemplate(assignment.template_id)
      : Promise.resolve(null),
    isStaff ? listClasses(assignment.course_id) : Promise.resolve([]),
    canManage ? listTemplates() : Promise.resolve([]),
  ]);

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
        canManage ? (
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

      {canManage && (
        <div className="mt-6 space-y-6">
          <Card title="Ubah Tugas">
            <form
              action={updateAssignmentAction}
              className="grid gap-3 sm:grid-cols-2"
            >
              <input
                type="hidden"
                name="assignmentId"
                value={assignment.id}
              />

              <Field label="Judul">
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={200}
                  defaultValue={assignment.title}
                  className={inputClass}
                />
              </Field>

              <Field
                label="Repository template"
                hint="Mengubah template tidak mengubah repository yang sudah disediakan."
              >
                <select
                  name="templateId"
                  defaultValue={assignment.template_id ?? ""}
                  className={inputClass}
                >
                  <option value="">— tanpa template —</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.owner}/{item.repo})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="sm:col-span-2">
                <Field label="Deskripsi (opsional)">
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={5000}
                    defaultValue={assignment.description ?? ""}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="Nilai maksimal">
                <input
                  name="maxScore"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={assignment.max_score}
                  className={inputClass}
                />
              </Field>

              <Field label="Tenggat (opsional)">
                <input
                  name="deadline"
                  type="datetime-local"
                  defaultValue={toLocalInputValue(assignment.deadline)}
                  className={inputClass}
                />
              </Field>

              <Field label="Percobaan maksimal (opsional)">
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  defaultValue={assignment.max_attempts ?? ""}
                  className={inputClass}
                  placeholder="tanpa batas"
                />
              </Field>

              <Field label="Mode penilaian">
                <select
                  name="scoringMode"
                  defaultValue={assignment.scoring_mode}
                  className={inputClass}
                >
                  <option value="BEST">Nilai terbaik</option>
                  <option value="LATEST">Nilai terakhir</option>
                </select>
              </Field>

              <div className="sm:col-span-2">
                <Button type="submit">Simpan perubahan</Button>
              </div>
            </form>
          </Card>

          <Card title="Hapus Tugas">
            <p className="text-sm text-slate-700">
              Repository GitHub mahasiswa dan seluruh riwayat nilai{" "}
              <strong>tidak ikut terhapus</strong>. Bila tugas ini sudah
              memiliki repository atau submission, tugas hanya diarsipkan
              sehingga hilang dari daftar tanpa menghapus data apa pun.
            </p>
            <form action={deleteAssignmentAction} className="mt-3">
              <input
                type="hidden"
                name="assignmentId"
                value={assignment.id}
              />
              <ConfirmButton
                message={`Yakin ingin menghapus tugas "${assignment.title}"? Repository mahasiswa dan riwayat nilai tidak akan terhapus.`}
              >
                Hapus tugas
              </ConfirmButton>
            </form>
          </Card>
        </div>
      )}
    </Shell>
  );
}
