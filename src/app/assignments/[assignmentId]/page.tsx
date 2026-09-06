import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import {
  canManageAssignment,
  canManageClassAssignmentSettings,
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
import {
  ATTEMPT_EXCLUSION_LABEL,
  SCORING_MODE_LABEL,
  summarizeClass,
} from "@/lib/grading/gradebook";
import { resolveAssignmentConfig } from "@/lib/grading/config";
import {
  countClassSettings,
  getClassSettings,
} from "@/lib/db/assignment-class-settings";
import { buildStudentOverview } from "@/lib/views/student-overview";
import { toWibInputValue } from "@/lib/time/wib";
import {
  deleteAssignmentAction,
  resetClassSettingsAction,
  togglePublishAction,
  updateAssignmentAction,
  updateClassSettingsAction,
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
          maksimal {assignment.max_score} · Nilai dasar: mode{" "}
          {SCORING_MODE_LABEL[assignment.scoring_mode]}
          {assignment.deadline
            ? ` · tenggat ${formatDate(assignment.deadline)}`
            : ""}
          {" · tiap kelas dapat berbeda"}
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
            {!view || view.attempts.length === 0 ? (
              <Empty>
                Belum ada percobaan. Dorong (push) kode ke repository Anda untuk
                memulai penilaian otomatis.
              </Empty>
            ) : (
              <Table
                head={["#", "Waktu", "Commit", "Status", "Nilai", "Test", ""]}
              >
                {view.attempts.map((attempt, index) => (
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

  const [submissions, repositories, override, jumlahKelasDisetel] =
    await Promise.all([
      listSubmissions({ assignmentId: assignment.id, userIds }),
      listRepositoriesForAssignment(assignment.id),
      selectedClass
        ? getClassSettings(assignment.id, selectedClass.id)
        : Promise.resolve(null),
      canManage ? countClassSettings(assignment.id) : Promise.resolve(0),
    ]);

  // Konfigurasi yang benar-benar berlaku untuk kelas yang sedang dilihat.
  const config = resolveAssignmentConfig(assignment, override);
  const canManageThisClass =
    selectedClass !== undefined &&
    canManageClassAssignmentSettings(ctx, selectedClass.id);

  const summaries = summarizeClass(userIds, submissions, config);

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
                    <Td>
                      {summary.attempts}
                      {summary.attempts !== summary.countedAttempts && (
                        <span className="ml-1 text-xs text-slate-500">
                          ({summary.countedAttempts} dihitung)
                        </span>
                      )}
                    </Td>
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

      {selectedClass && canManageThisClass && (
        <div className="mt-6">
          <Card
            title={`Setelan Kelas — ${selectedClass.name}`}
            action={
              <span className="text-xs text-slate-600">
                {config.source === "KELAS"
                  ? "Disetel untuk kelas ini"
                  : "Mengikuti nilai dasar"}
              </span>
            }
          >
            <p className="mb-3 text-sm text-slate-600">
              Tugas <strong>{assignment.title}</strong> · nilai maksimal{" "}
              {assignment.max_score} · template{" "}
              {template ? `${template.owner}/${template.repo}` : "belum ada"}.
              Ketiganya sama untuk seluruh kelas dan hanya dapat diubah admin.
            </p>

            <form
              action={updateClassSettingsAction}
              className="grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <input type="hidden" name="classId" value={selectedClass.id} />

              <Field
                label="Tenggat (opsional, WIB)"
                hint="Kosongkan untuk kelas tanpa tenggat. Percobaan setelah tenggat tetap tersimpan dan tetap terlihat, tetapi tidak masuk hitungan nilai."
              >
                <input
                  name="deadline"
                  type="datetime-local"
                  defaultValue={toWibInputValue(config.deadline)}
                  className={inputClass}
                />
              </Field>

              <Field
                label="Percobaan maksimal (opsional)"
                hint="Kosongkan untuk tanpa batas. Percobaan yang gagal kompilasi atau masih berjalan tidak memakan jatah."
              >
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  defaultValue={config.maxAttempts ?? ""}
                  className={inputClass}
                  placeholder="tanpa batas"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  label="Mode penilaian"
                  hint="Boleh diubah kapan saja: nilai pertama, terbaik, dan terakhir semuanya tetap tersimpan, jadi berpindah mode tidak menghilangkan riwayat."
                >
                  <select
                    name="scoringMode"
                    defaultValue={config.scoringMode}
                    className={inputClass}
                  >
                    <option value="BEST">Nilai terbaik</option>
                    <option value="LATEST">Nilai terakhir</option>
                    <option value="FIRST">Nilai pertama</option>
                  </select>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Button type="submit">Simpan setelan kelas</Button>
              </div>
            </form>

            {config.source === "KELAS" && (
              <form action={resetClassSettingsAction} className="mt-3">
                <input
                  type="hidden"
                  name="assignmentId"
                  value={assignment.id}
                />
                <input type="hidden" name="classId" value={selectedClass.id} />
                <ConfirmButton
                  variant="secondary"
                  message={`Kembalikan ${selectedClass.name} ke nilai dasar yang ditetapkan admin? Riwayat nilai tidak terhapus.`}
                >
                  Ikuti nilai dasar lagi
                </ConfirmButton>
              </form>
            )}
          </Card>
        </div>
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

              <Field label="Tenggat (opsional, WIB)">
                <input
                  name="deadline"
                  type="datetime-local"
                  defaultValue={toWibInputValue(assignment.deadline)}
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

              <Field
                label="Mode penilaian"
                hint="Boleh diubah kapan saja: nilai pertama, terbaik, dan terakhir semuanya tetap tersimpan, jadi berpindah mode tidak menghilangkan riwayat."
              >
                <select
                  name="scoringMode"
                  defaultValue={assignment.scoring_mode}
                  className={inputClass}
                >
                  <option value="BEST">Nilai terbaik</option>
                  <option value="LATEST">Nilai terakhir</option>
                  <option value="FIRST">Nilai pertama</option>
                </select>
              </Field>

              <p className="sm:col-span-2 text-xs text-slate-600">
                &quot;Simpan perubahan&quot; tidak menyentuh kelas yang sudah
                disetel asistennya
                {jumlahKelasDisetel > 0 ? ` (${jumlahKelasDisetel} kelas)` : ""}.
              </p>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <Button type="submit">Simpan perubahan</Button>
                <ConfirmButton
                  variant="secondary"
                  name="applyToAllClasses"
                  value="1"
                  message={
                    jumlahKelasDisetel > 0
                      ? `Setelan pada ${jumlahKelasDisetel} kelas akan dihapus dan semua kelas kembali mengikuti nilai dasar. Riwayat nilai tidak terhapus. Lanjutkan?`
                      : "Belum ada kelas yang disetel terpisah, jadi tidak ada yang hilang. Lanjutkan?"
                  }
                >
                  Simpan dan terapkan ke semua kelas
                </ConfirmButton>
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
