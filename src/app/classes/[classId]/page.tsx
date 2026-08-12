import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import {
  canAssignAssistants,
  canManageClassRoster,
  canViewClass,
} from "@/lib/auth/policy";
import { getClass, getCourse, listClassMembers } from "@/lib/db/courses";
import { listAssignments } from "@/lib/db/assignments";
import {
  addStudentAction,
  assignAssistantAction,
  removeMemberAction,
} from "@/lib/actions/courses";
import { Shell } from "@/components/shell";
import { Forbidden } from "@/components/forbidden";
import {
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

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { classId } = await params;
  const { error } = await searchParams;

  const user = await requireUser();
  const ctx = await loadAccessContext(user);

  const klass = await getClass(classId);
  if (!klass) notFound();
  if (!canViewClass(ctx, klass.id)) return <Forbidden user={user} />;

  const [course, students, assistants, assignments] = await Promise.all([
    getCourse(klass.course_id),
    listClassMembers(klass.id, "STUDENT"),
    listClassMembers(klass.id, "ASSISTANT"),
    listAssignments(klass.course_id),
  ]);

  const canEdit = canManageClassRoster(ctx, klass.id);

  return (
    <Shell user={user}>
      <PageHeader
        title={`${klass.name} — ${course?.name ?? ""}`}
        subtitle={`${students.length} mahasiswa · ${assistants.length} asisten`}
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        <Card title="Gradebook per Tugas">
          {assignments.length === 0 ? (
            <Empty>Belum ada tugas pada mata kuliah ini.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {assignments.map((assignment) => (
                <li key={assignment.id}>
                  <Link
                    href={`/assignments/${assignment.id}?classId=${klass.id}`}
                    className="inline-block rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {assignment.meeting_number}. {assignment.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Mahasiswa">
          {students.length === 0 ? (
            <Empty>Belum ada mahasiswa di kelas ini.</Empty>
          ) : (
            <Table head={["Nama", "GitHub", ""]}>
              {students.map((member) => (
                <tr key={member.user.id}>
                  <Td>
                    <Link
                      href={`/students/${member.user.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {member.user.display_name ?? member.user.github_login}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">
                    @{member.user.github_login}
                  </Td>
                  <Td className="text-right">
                    {canEdit && (
                      <form action={removeMemberAction}>
                        <input
                          type="hidden"
                          name="classId"
                          value={klass.id}
                        />
                        <input
                          type="hidden"
                          name="userId"
                          value={member.user.id}
                        />
                        <Button type="submit" variant="danger">
                          Keluarkan
                        </Button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {canEdit && (
            <Card title="Tambah Mahasiswa">
              <form action={addStudentAction} className="space-y-3">
                <input type="hidden" name="classId" value={klass.id} />
                <Field
                  label="Username GitHub"
                  hint="Akun diverifikasi langsung ke GitHub sebelum ditambahkan."
                >
                  <input
                    name="githubLogin"
                    required
                    maxLength={39}
                    className={inputClass}
                    placeholder="dimas"
                  />
                </Field>
                <Button type="submit">Tambah</Button>
              </form>
            </Card>
          )}

          <Card title="Asisten Kelas">
            {assistants.length === 0 ? (
              <Empty>Belum ada asisten.</Empty>
            ) : (
              <ul className="mb-3 space-y-1 text-sm text-slate-700">
                {assistants.map((member) => (
                  <li key={member.user.id}>
                    {member.user.display_name ?? member.user.github_login}{" "}
                    <span className="text-slate-500">
                      @{member.user.github_login}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canAssignAssistants(ctx) && (
              <form action={assignAssistantAction} className="space-y-3">
                <input type="hidden" name="classId" value={klass.id} />
                <Field label="Tugaskan asisten (username GitHub)">
                  <input
                    name="githubLogin"
                    required
                    maxLength={39}
                    className={inputClass}
                    placeholder="asisten1"
                  />
                </Field>
                <Button type="submit">Tugaskan</Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
