import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { loadAccessContext } from "@/lib/auth/authorize";
import {
  canAssignAssistants,
  canManageClassRoster,
  canManageJoinLink,
  canViewClass,
} from "@/lib/auth/policy";
import { getClass, getCourse, listClassMembers } from "@/lib/db/courses";
import { listAssignments } from "@/lib/db/assignments";
import { getActiveJoinLink } from "@/lib/db/join-links";
import { buildJoinUrl, joinLinkStatus } from "@/lib/auth/join-token";
import { env } from "@/lib/env";
import {
  addStudentAction,
  assignAssistantAction,
  removeMemberAction,
} from "@/lib/actions/courses";
import {
  generateJoinLinkAction,
  revokeJoinLinkAction,
} from "@/lib/actions/join";
import { Shell } from "@/components/shell";
import { Forbidden } from "@/components/forbidden";
import { ConfirmButton, CopyField } from "@/components/confirm";
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

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const { classId } = await params;
  const { error, token } = await searchParams;

  const user = await requireUser();
  const ctx = await loadAccessContext(user);

  const klass = await getClass(classId);
  if (!klass) notFound();
  if (!canViewClass(ctx, klass.id)) return <Forbidden user={user} />;

  const canEdit = canManageClassRoster(ctx, klass.id);
  const canShareLink = canManageJoinLink(ctx, klass.id);

  const [course, students, assistants, assignments, joinLink] =
    await Promise.all([
      getCourse(klass.course_id),
      listClassMembers(klass.id, "STUDENT"),
      listClassMembers(klass.id, "ASSISTANT"),
      listAssignments(klass.course_id),
      canShareLink ? getActiveJoinLink(klass.id) : Promise.resolve(null),
    ]);

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
        {canShareLink && (
          <Card title="Tautan Undangan Kelas">
            {token ? (
              // Satu-satunya saat token asli terlihat: database hanya menyimpan hash.
              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  Tautan baru dibuat. <strong>Salin sekarang</strong> — token
                  hanya ditampilkan kali ini.
                </p>
                <CopyField value={buildJoinUrl(env.appUrl, token)} />
              </div>
            ) : joinLink ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  Kelas ini punya tautan undangan aktif{" "}
                  <Badge value={joinLinkStatus(joinLink)} /> dibuat{" "}
                  {formatDate(joinLink.created_at)}
                  {joinLink.expires_at
                    ? `, berlaku sampai ${formatDate(joinLink.expires_at)}`
                    : ", tanpa masa berlaku"}
                  .
                </p>
                <p className="text-sm text-slate-600">
                  Isi tautannya tidak dapat ditampilkan lagi karena hanya
                  hash-nya yang disimpan. Buat ulang bila tautannya hilang.
                </p>
              </div>
            ) : (
              <Empty>
                Belum ada tautan undangan. Mahasiswa masih bisa ditambahkan
                manual di bawah.
              </Empty>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <form action={generateJoinLinkAction} className="flex items-end gap-2">
                <input type="hidden" name="classId" value={klass.id} />
                <Field
                  label="Berlaku (hari)"
                  hint="Kosongkan untuk tanpa batas waktu."
                >
                  <input
                    name="expiresInDays"
                    type="number"
                    min={1}
                    max={365}
                    className={`${inputClass} w-32`}
                    placeholder="—"
                  />
                </Field>
                {joinLink ? (
                  <ConfirmButton
                    variant="secondary"
                    message="Buat ulang tautan? Tautan lama langsung tidak berlaku."
                  >
                    Buat ulang
                  </ConfirmButton>
                ) : (
                  <Button type="submit">Buat tautan</Button>
                )}
              </form>

              {joinLink && (
                <form action={revokeJoinLinkAction}>
                  <input type="hidden" name="classId" value={klass.id} />
                  <ConfirmButton message="Cabut tautan undangan? Tautan lama tidak akan bisa dipakai lagi.">
                    Cabut
                  </ConfirmButton>
                </form>
              )}
            </div>
          </Card>
        )}

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
                        <ConfirmButton
                          message={`Keluarkan @${member.user.github_login} dari kelas ini? Repository dan nilainya tidak ikut terhapus.`}
                        >
                          Keluarkan
                        </ConfirmButton>
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
