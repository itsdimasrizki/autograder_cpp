import Link from "next/link";
import { requireRole } from "@/lib/auth/current-user";
import { listAssignmentsUsingTemplate, listTemplates } from "@/lib/db/assignments";
import { createTemplateAction } from "@/lib/actions/assignments";
import { Shell } from "@/components/shell";
import {
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

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Otorisasi di server, bukan sekadar menyembunyikan tautan navigasi.
  const user = await requireRole("SUPER_ADMIN");
  const { error } = await searchParams;

  const templates = await listTemplates();

  // Jumlah tugas pemakai ditampilkan supaya alasan penolakan hapus terlihat
  // sebelum tombolnya ditekan.
  const usage = await Promise.all(
    templates.map(async (template) => ({
      template,
      dependents: await listAssignmentsUsingTemplate(template.id),
    })),
  );

  return (
    <Shell user={user}>
      <PageHeader
        title="Repository Template"
        subtitle="Template dipakai sebagai isi awal repository setiap mahasiswa."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="space-y-6">
        <Card title="Daftar Template">
          {usage.length === 0 ? (
            <Empty>Belum ada template terdaftar.</Empty>
          ) : (
            <Table head={["Nama", "Repository", "Dipakai", "Dibuat", ""]}>
              {usage.map(({ template, dependents }) => (
                <tr key={template.id}>
                  <Td>
                    <Link
                      href={`/templates/${template.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {template.name}
                    </Link>
                  </Td>
                  <Td>
                    <a
                      href={`https://github.com/${template.owner}/${template.repo}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-slate-600 hover:underline"
                    >
                      {template.owner}/{template.repo}
                    </a>
                  </Td>
                  <Td className="text-slate-600">
                    {dependents.length === 0
                      ? "—"
                      : `${dependents.length} tugas`}
                  </Td>
                  <Td className="text-slate-600">
                    {formatDate(template.created_at)}
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/templates/${template.id}`}
                      className="text-sm text-slate-700 hover:underline"
                    >
                      Detail
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Daftarkan Repository Template">
          <form action={createTemplateAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama template">
              <input
                name="name"
                required
                className={inputClass}
                placeholder="Praktikum 01 Template"
              />
            </Field>
            <Field label="Owner (organisasi/pengguna GitHub)">
              <input
                name="owner"
                required
                className={inputClass}
                placeholder="nama-organisasi"
              />
            </Field>
            <Field
              label="Nama repository"
              hint="Repository harus ditandai sebagai Template di GitHub."
            >
              <input
                name="repo"
                required
                className={inputClass}
                placeholder="praktikum-01-template"
              />
            </Field>
            <Field label="Deskripsi (opsional)">
              <input name="description" className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Daftarkan</Button>
            </div>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
