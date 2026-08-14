import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-user";
import {
  getTemplate,
  listAssignmentsUsingTemplate,
} from "@/lib/db/assignments";
import {
  deleteTemplateAction,
  updateTemplateAction,
} from "@/lib/actions/assignments";
import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  PageHeader,
  formatDate,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { templateId } = await params;
  const { error } = await searchParams;

  const user = await requireRole("SUPER_ADMIN");

  const template = await getTemplate(templateId);
  if (!template) notFound();

  const dependents = await listAssignmentsUsingTemplate(template.id);

  return (
    <Shell user={user}>
      <PageHeader
        title={template.name}
        subtitle={`${template.owner}/${template.repo}`}
        action={
          <Link
            href="/templates"
            className="text-sm text-slate-700 hover:underline"
          >
            ← Semua template
          </Link>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        <Card title="Informasi">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Repository GitHub</dt>
              <dd>
                <a
                  href={`https://github.com/${template.owner}/${template.repo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-slate-800 hover:underline"
                >
                  {template.owner}/{template.repo}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Terdaftar</dt>
              <dd className="text-slate-800">
                {formatDate(template.created_at)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Ubah Metadata">
          <form action={updateTemplateAction} className="space-y-3">
            <input type="hidden" name="templateId" value={template.id} />
            <Field label="Nama template">
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={template.name}
                className={inputClass}
              />
            </Field>
            <Field
              label="Deskripsi (opsional)"
              hint="Owner dan nama repository tidak dapat diubah — keduanya menentukan identitas template."
            >
              <textarea
                name="description"
                rows={2}
                maxLength={500}
                defaultValue={template.description ?? ""}
                className={inputClass}
              />
            </Field>
            <Button type="submit">Simpan</Button>
          </form>
        </Card>

        <Card title="Tugas yang Memakai Template Ini">
          {dependents.length === 0 ? (
            <Empty>Belum ada tugas aktif yang memakai template ini.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {dependents.map((assignment) => (
                <li key={assignment.id}>
                  <Link
                    href={`/assignments/${assignment.id}`}
                    className="text-slate-800 hover:underline"
                  >
                    Pertemuan {assignment.meeting_number} — {assignment.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hapus Template">
          <p className="text-sm text-slate-700">
            Menghapus template hanya menghilangkan pendaftarannya dari aplikasi.
            Repository GitHub{" "}
            <span className="font-mono text-xs">
              {template.owner}/{template.repo}
            </span>{" "}
            <strong>tidak ikut terhapus</strong>.
          </p>

          {dependents.length > 0 ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Tidak dapat dihapus: masih dipakai {dependents.length} tugas
              aktif. Lepaskan template dari tugas tersebut lebih dulu.
            </p>
          ) : (
            <form action={deleteTemplateAction} className="mt-3">
              <input type="hidden" name="templateId" value={template.id} />
              <ConfirmButton message="Yakin ingin menghapus template ini? Repository GitHub-nya tidak akan terhapus.">
                Hapus template
              </ConfirmButton>
            </form>
          )}
        </Card>
      </div>
    </Shell>
  );
}
