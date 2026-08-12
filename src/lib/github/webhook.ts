import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifikasi tanda tangan webhook GitHub (header X-Hub-Signature-256).
 *
 * Murni supaya bisa diuji langsung. Secret hanya ada di sisi server —
 * repository mahasiswa tidak pernah menyimpan rahasia apa pun.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  const received = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);

  if (received.length !== computed.length) return false;
  return timingSafeEqual(received, computed);
}

/** Payload workflow_run yang dipakai aplikasi. */
export interface WorkflowRunEvent {
  action: string;
  repositoryFullName: string;
  runId: number;
  runAttempt: number;
  headSha: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
  updatedAt: string | null;
}

/**
 * Mengambil field yang dibutuhkan dari event workflow_run.
 * Mengembalikan null bila bentuk payload tidak dikenali.
 */
export function parseWorkflowRunEvent(
  payload: unknown,
): WorkflowRunEvent | null {
  if (typeof payload !== "object" || payload === null) return null;

  const event = payload as Record<string, unknown>;
  const run = event.workflow_run as Record<string, unknown> | undefined;
  const repository = event.repository as Record<string, unknown> | undefined;

  if (!run || !repository) return null;

  const runId = run.id;
  const fullName = repository.full_name;
  const headSha = run.head_sha;

  if (
    typeof runId !== "number" ||
    typeof fullName !== "string" ||
    typeof headSha !== "string"
  ) {
    return null;
  }

  return {
    action: typeof event.action === "string" ? event.action : "",
    repositoryFullName: fullName,
    runId,
    runAttempt: typeof run.run_attempt === "number" ? run.run_attempt : 1,
    headSha,
    status: typeof run.status === "string" ? run.status : "",
    conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
    htmlUrl: typeof run.html_url === "string" ? run.html_url : null,
    updatedAt: typeof run.updated_at === "string" ? run.updated_at : null,
  };
}
