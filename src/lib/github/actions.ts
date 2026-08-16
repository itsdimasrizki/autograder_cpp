import "server-only";

import { githubDownload, githubRequest, githubRequestOrNull } from "@/lib/github/client";
import { readZipFile } from "@/lib/grading/unzip";
import {
  parseGradingResultJson,
  type GradingResult,
} from "@/lib/grading/result";

/** Nama artifact yang diunggah workflow penilaian di repo mahasiswa. */
export const GRADING_ARTIFACT_NAME = "grading-result";
export const GRADING_RESULT_FILE = "result.json";

interface RunActor {
  login: string;
  type: string;
}

export interface WorkflowRun {
  id: number;
  run_attempt: number;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  /** Pemicu run; dipakai memisahkan push praktikan dari commit GitHub App. */
  event?: string | null;
  actor?: RunActor | null;
  triggering_actor?: RunActor | null;
}

export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowRun | null> {
  return githubRequestOrNull<WorkflowRun>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/actions/runs/${runId}`,
  );
}

/** Riwayat workflow run terbaru pada sebuah repository. */
export async function listWorkflowRuns(
  owner: string,
  repo: string,
  perPage = 30,
): Promise<WorkflowRun[]> {
  const data = await githubRequestOrNull<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/actions/runs?per_page=${perPage}`,
  );
  return data?.workflow_runs ?? [];
}

interface Artifact {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes: number;
}

async function listRunArtifacts(
  owner: string,
  repo: string,
  runId: number,
): Promise<Artifact[]> {
  const data = await githubRequestOrNull<{ artifacts: Artifact[] }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/actions/runs/${runId}/artifacts?per_page=100`,
  );
  return data?.artifacts ?? [];
}

/** Batas ukuran unduhan; result.json normalnya hanya beberapa kilobyte. */
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

/**
 * Mengunduh dan membaca hasil penilaian dari sebuah workflow run.
 *
 * Mengembalikan null bila artifact belum ada atau sudah kedaluwarsa —
 * pemanggil memutuskan apakah itu berarti "masih berjalan" atau "gagal".
 */
export async function fetchGradingResult(params: {
  owner: string;
  repo: string;
  runId: number;
  maxScore?: number;
}): Promise<GradingResult | null> {
  const artifacts = await listRunArtifacts(
    params.owner,
    params.repo,
    params.runId,
  );

  const artifact = artifacts.find(
    (candidate) => candidate.name === GRADING_ARTIFACT_NAME,
  );
  if (!artifact || artifact.expired) return null;

  if (artifact.size_in_bytes > MAX_ARTIFACT_BYTES) {
    throw new Error(
      `Artifact hasil penilaian terlalu besar (${artifact.size_in_bytes} byte).`,
    );
  }

  const zip = await githubDownload(
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/actions/artifacts/${artifact.id}/zip`,
  );

  const file = readZipFile(zip, GRADING_RESULT_FILE);
  if (!file) return null;

  return parseGradingResultJson(file.toString("utf8"), params.maxScore ?? 100);
}

/** Menjalankan ulang seluruh job pada sebuah run (dipakai asisten bila perlu). */
export async function rerunWorkflow(
  owner: string,
  repo: string,
  runId: number,
): Promise<void> {
  await githubRequest<unknown>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/actions/runs/${runId}/rerun`,
    { method: "POST" },
  );
}
