import Link from "next/link";
import type { User } from "@/lib/db/types";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui";

/** Ditampilkan saat pengguna sudah masuk tetapi tidak berhak atas sumber daya. */
export function Forbidden({
  user,
  message = "Anda tidak memiliki akses ke halaman ini.",
}: {
  user: User;
  message?: string;
}) {
  return (
    <Shell user={user}>
      <Card title="Akses ditolak">
        <p className="text-sm text-slate-700">{message}</p>
        <Link
          href="/dashboard"
          className="mt-3 inline-block text-sm text-slate-900 underline"
        >
          Kembali ke dasbor
        </Link>
      </Card>
    </Shell>
  );
}
