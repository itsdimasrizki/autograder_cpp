import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/lib/db/types";
import { Badge } from "@/components/ui";

/** Kerangka halaman: navigasi atas + konten. Tautan menyesuaikan role. */
export function Shell({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const links: Array<{ href: string; label: string }> = [
    { href: "/dashboard", label: "Dasbor" },
    { href: "/courses", label: "Mata Kuliah" },
  ];
  if (user.role === "SUPER_ADMIN") {
    links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-sm font-semibold text-slate-900">
            Praktikum Struktur Data
          </Link>

          <nav className="flex flex-1 gap-4 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-slate-600 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-700 sm:inline">
              @{user.github_login}
            </span>
            <Badge value={user.role} />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
