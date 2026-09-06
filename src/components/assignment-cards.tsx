import Link from "next/link";
import type { StudentAssignmentView } from "@/lib/views/student-overview";
import { Badge, formatDate } from "@/components/ui";

/** Kartu ringkasan tugas pada dasbor mahasiswa. */
export function AssignmentCards({ items }: { items: StudentAssignmentView[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map(({ assignment, repository, summary, trail, config }) => (
        <li
          key={assignment.id}
          className="rounded border border-slate-200 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/assignments/${assignment.id}`}
              className="font-medium text-slate-900 hover:underline"
            >
              {assignment.title}
            </Link>
            <Badge
              value={
                summary.status === "NOT_SUBMITTED" ? "PENDING" : summary.status
              }
            />
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-700">
            <dt className="text-slate-500">Nilai berlaku</dt>
            <dd className="text-right font-medium">
              {summary.effectiveScore ?? "—"} / {assignment.max_score}
            </dd>

            <dt className="text-slate-500">Terakhir / Terbaik</dt>
            <dd className="text-right">
              {summary.latestScore ?? "—"} / {summary.bestScore ?? "—"}
            </dd>

            <dt className="text-slate-500">Percobaan</dt>
            <dd className="text-right">
              {summary.attempts}
              {config.maxAttempts ? ` / ${config.maxAttempts}` : ""}
              {summary.attempts !== summary.countedAttempts && (
                <span className="ml-1 text-xs text-slate-500">
                  ({summary.countedAttempts} dihitung)
                </span>
              )}
            </dd>

            <dt className="text-slate-500">Tenggat</dt>
            <dd className="text-right">{formatDate(config.deadline)}</dd>
          </dl>

          <p className="mt-2 text-sm text-slate-600">
            Riwayat: <span className="font-mono">{trail}</span>
          </p>

          {repository?.html_url ? (
            <a
              href={repository.html_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-slate-900 underline"
            >
              Buka GitHub
            </a>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Repository belum disediakan.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
