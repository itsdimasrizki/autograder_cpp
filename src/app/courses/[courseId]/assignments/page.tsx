import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import { canManageAssignment, canViewAssignment, canViewCourse } from "@/lib/auth/policy";
import { getCourse } from "@/lib/db/courses";
import { listAssignments, listTemplates } from "@/lib/db/assignments";
import {
  createAssignmentAction,
  deleteAssignmentAction,
  restoreAssignmentAction,
} from "@/lib/actions/assignments";
import { Shell } from "@/components/shell";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton } from "@/components/confirm";
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

export default async function AssignmentsPage({
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

  const canManage = canManageAssignment(ctx);

  // Ketiganya saling lepas, jadi satu gelombang saja. Admin cukup mengambil
  // daftar lengkap sekali lalu memilahnya di memori — dua query terpisah untuk
  // aktif dan terarsip hanya menambah satu perjalanan bolak-balik.
  const [allAssignments, templates] = await Promise.all([
    listAssignments(course.id, { includeArchived: canManage }),
    canManage ? listTemplates() : Promise.resolve([]),
  ]);

  // Tugas yang belum diterbitkan disaring lewat kebijakan terpusat.
  const assignments = allAssignments
    .filter((assignment) => assignment.archived_at === null)
    .filter((assignment) => canViewAssignment(ctx, assignment));

  // Tugas yang diarsipkan hanya terlihat oleh admin, terpisah dari daftar aktif.
  const archived = allAssignments.filter(
    (assignment) => assignment.archived_at !== null,
  );

  return (
    <Shell user={user}>
      <PageHeader
        title={`Tugas — ${course.name}`}
        subtitle="Satu tugas untuk setiap pertemuan praktikum."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        <Card title="Daftar Tugas">
          {assignments.length === 0 ? (
            <Empty>Belum ada tugas yang tersedia.</Empty>
          ) : (
            <Table
              head={["#", "Judul", "Tenggat", "Mode", "Status", ""]}
            >
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <Td className="text-slate-500">
                    {assignment.meeting_number}
                  </Td>
                  <Td>
                    <Link
                      href={`/assignments/${assignment.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {assignment.title}
                    </Link>
                  </Td>
                  <Td>{formatDate(assignment.deadline)}</Td>
                  <Td>{assignment.scoring_mode}</Td>
                  <Td>
                    <Badge
                      value={assignment.published ? "READY" : "PENDING"}
                    />
                    <span className="ml-2 text-xs text-slate-600">
                      {assignment.published ? "Terbit" : "Draf"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/assignments/${assignment.id}`}
                        className="text-sm text-slate-700 hover:underline"
                      >
                        Detail
                      </Link>
                      {canManage && (
                        <form action={deleteAssignmentAction}>
                          <input
                            type="hidden"
                            name="assignmentId"
                            value={assignment.id}
                          />
                          <ConfirmButton message={`Yakin ingin menghapus tugas "${assignment.title}"? Repository mahasiswa dan riwayat nilai TIDAK ikut terhapus; bila tugas ini sudah punya submission, tugas hanya diarsipkan.`}>
                            Hapus
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {archived.length > 0 && (
          <Card title="Tugas Diarsipkan">
            <p className="mb-3 text-sm text-slate-600">
              Tugas berikut disembunyikan dari mahasiswa. Repository dan seluruh
              riwayat nilainya tetap tersimpan.
            </p>
            <Table head={["#", "Judul", "Diarsipkan", ""]}>
              {archived.map((assignment) => (
                <tr key={assignment.id}>
                  <Td className="text-slate-500">
                    {assignment.meeting_number}
                  </Td>
                  <Td>{assignment.title}</Td>
                  <Td>{formatDate(assignment.archived_at)}</Td>
                  <Td className="text-right">
                    <form action={restoreAssignmentAction}>
                      <input
                        type="hidden"
                        name="assignmentId"
                        value={assignment.id}
                      />
                      <Button type="submit" variant="secondary">
                        Pulihkan
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}

        {canManage && (
          <Card title="Buat Tugas Baru">
            <form
              action={createAssignmentAction}
              className="grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="courseId" value={course.id} />

              <Field label="Nomor pertemuan">
                <input
                  name="meetingNumber"
                  type="number"
                  min={1}
                  max={99}
                  required
                  defaultValue={assignments.length + 1}
                  className={inputClass}
                />
              </Field>

              <Field label="Judul">
                <input
                  name="title"
                  required
                  maxLength={200}
                  className={inputClass}
                  placeholder="Pertemuan 1 - Struktur Data C++ & GitHub"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Deskripsi (opsional)">
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={5000}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                label="Repository template"
                hint="Daftarkan template lebih dulu di halaman Admin."
              >
                <select name="templateId" className={inputClass}>
                  <option value="">— tanpa template —</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.owner}/{template.repo})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Nilai maksimal">
                <input
                  name="maxScore"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={100}
                  className={inputClass}
                />
              </Field>

              <Field label="Tenggat (opsional)">
                <input
                  name="deadline"
                  type="datetime-local"
                  className={inputClass}
                />
              </Field>

              <Field label="Percobaan maksimal (opsional)">
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  className={inputClass}
                  placeholder="tanpa batas"
                />
              </Field>

              <Field label="Mode penilaian">
                <select name="scoringMode" className={inputClass}>
                  <option value="BEST">Nilai terbaik</option>
                  <option value="LATEST">Nilai terakhir</option>
                </select>
              </Field>

              <div className="sm:col-span-2">
                <Button type="submit">Buat Tugas</Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </Shell>
  );
}
