import type { ReactNode } from "react";

/** Primitif UI sederhana. Sengaja minim — ini alat internal, bukan produk. */

export function Card({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  PASS: "bg-emerald-100 text-emerald-800",
  FAIL: "bg-red-100 text-red-800",
  ERROR: "bg-amber-100 text-amber-800",
  QUEUED: "bg-slate-100 text-slate-700",
  RUNNING: "bg-blue-100 text-blue-800",
  READY: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-slate-100 text-slate-700",
  FAILED: "bg-red-100 text-red-800",
  SKIP: "bg-slate-100 text-slate-600",
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  ASSISTANT: "bg-blue-100 text-blue-800",
  STUDENT: "bg-slate-100 text-slate-700",
  neutral: "bg-slate-100 text-slate-700",
};

export function Badge({ value }: { value: string }) {
  const style = badgeStyles[value] ?? badgeStyles.neutral;
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {value}
    </span>
  );
}

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {head.map((cell, index) => (
              <th key={index} className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex items-center rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

/**
 * Format tanggal ringkas untuk tabel — selalu WIB.
 *
 * Satu-satunya implementasi ada di @/lib/time/wib; di sini hanya diekspor
 * ulang supaya belasan pemanggil yang sudah ada tidak perlu diubah.
 */
export { formatWib as formatDate } from "@/lib/time/wib";
