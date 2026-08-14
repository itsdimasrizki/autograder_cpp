import Link from "next/link";
import { requireRole } from "@/lib/auth/current-user";
import { countUsersByRole, listUsers } from "@/lib/db/users";
import { listClassesForUsers } from "@/lib/db/courses";
import { setRoleAction } from "@/lib/actions/admin";
import type { UserRole } from "@/lib/db/types";
import {
  USER_TABS,
  parseUserTab,
  tabToRoleFilter,
  type UserTab,
} from "@/lib/user-filter";
import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm";
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  PageHeader,
  Table,
  Td,
  formatDate,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string }>;
}) {
  // Daftar seluruh pengguna hanya untuk SUPER_ADMIN.
  const admin = await requireRole("SUPER_ADMIN");
  const { error, role } = await searchParams;

  const tab = parseUserTab(role);

  // Penyaringan dilakukan di database, bukan dengan mengirim semua baris lalu
  // menyembunyikannya di browser.
  const [users, counts] = await Promise.all([
    listUsers({ role: tabToRoleFilter(tab) }),
    countUsersByRole(),
  ]);

  const classesByUser = await listClassesForUsers(users.map((u) => u.id));

  const tabCount: Record<UserTab, number> = {
    ALL: counts.STUDENT + counts.ASSISTANT + counts.SUPER_ADMIN,
    STUDENT: counts.STUDENT,
    ASSISTANT: counts.ASSISTANT,
    SUPER_ADMIN: counts.SUPER_ADMIN,
  };

  return (
    <Shell user={admin}>
      <PageHeader
        title="Pengguna"
        subtitle="Setiap pengguna dikenali dari akun GitHub-nya."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {USER_TABS.map((value) => (
          <Link
            key={value}
            href={value === "ALL" ? "/users" : `/users?role=${value}`}
            className={`rounded border px-3 py-1.5 text-sm font-medium ${
              tab === value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {value}{" "}
            <span
              className={tab === value ? "text-slate-300" : "text-slate-500"}
            >
              {tabCount[value]}
            </span>
          </Link>
        ))}
      </nav>

      <Card>
        {users.length === 0 ? (
          <Empty>Tidak ada pengguna pada filter ini.</Empty>
        ) : (
          <Table
            head={[
              "Nama",
              "GitHub",
              "Role",
              "Status",
              "Kelas",
              "Dibuat pada",
              "Aksi",
            ]}
          >
            {users.map((row) => {
              const classes = classesByUser[row.id] ?? [];
              // "Belum pernah masuk" ditandai lewat ketiadaan email: baris yang
              // dibuat asisten lewat username GitHub tidak punya email.
              const pernahLogin = row.email !== null;

              return (
                <tr key={row.id}>
                  <Td>{row.display_name ?? row.github_login}</Td>
                  <Td>
                    <a
                      href={`https://github.com/${row.github_login}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-600 hover:underline"
                    >
                      @{row.github_login}
                    </a>
                  </Td>
                  <Td>
                    <Badge value={row.role} />
                  </Td>
                  <Td className="text-slate-600">
                    {pernahLogin ? "Aktif" : "Belum pernah masuk"}
                  </Td>
                  <Td className="text-slate-600">
                    {classes.length === 0
                      ? "—"
                      : classes
                          .map((c) =>
                            c.role === "ASSISTANT"
                              ? `${c.class_name} (asisten)`
                              : c.class_name,
                          )
                          .join(", ")}
                  </Td>
                  <Td className="text-slate-600">
                    {formatDate(row.created_at)}
                  </Td>
                  <Td>
                    <RoleAction
                      userId={row.id}
                      login={row.github_login}
                      role={row.role}
                      isSelf={row.id === admin.id}
                      backTo={tab === "ALL" ? "/users" : `/users?role=${tab}`}
                    />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </Shell>
  );
}

/**
 * Tombol promosi/penurunan.
 *
 * Sengaja hanya dua arah STUDENT <-> ASSISTANT. SUPER_ADMIN tidak pernah bisa
 * disentuh dari sini, dan tidak ada jalan mengangkat siapa pun menjadi
 * SUPER_ADMIN lewat UI — itu ditetapkan lewat GITHUB_SUPER_ADMINS. Aturan yang
 * sama diuji ulang di server oleh `canChangeRole`.
 */
function RoleAction({
  userId,
  login,
  role,
  isSelf,
  backTo,
}: {
  userId: string;
  login: string;
  role: UserRole;
  isSelf: boolean;
  backTo: string;
}) {
  if (role === "SUPER_ADMIN") {
    return <span className="text-xs text-slate-500">—</span>;
  }
  if (isSelf) {
    return <span className="text-xs text-slate-500">akun Anda</span>;
  }

  const nextRole: UserRole = role === "STUDENT" ? "ASSISTANT" : "STUDENT";
  const label = role === "STUDENT" ? "Jadikan asisten" : "Jadikan mahasiswa";

  return (
    <form action={setRoleAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={nextRole} />
      <input type="hidden" name="backTo" value={backTo} />
      <ConfirmButton
        variant="secondary"
        message={`Ubah role @${login} dari ${role} menjadi ${nextRole}?`}
      >
        {label}
      </ConfirmButton>
    </form>
  );
}
