import "server-only";

import {
  GitHubError,
  githubRequest,
  githubRequestOrNull,
} from "@/lib/github/client";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
}

export async function getRepo(
  owner: string,
  repo: string,
): Promise<GitHubRepo | null> {
  return githubRequestOrNull<GitHubRepo>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
}

/**
 * Membuat repository privat dari repository template.
 *
 * Repository baru sudah berisi starter code dan workflow penilaian karena
 * keduanya ada di dalam template.
 */
export async function generateFromTemplate(params: {
  templateOwner: string;
  templateRepo: string;
  owner: string;
  name: string;
  description?: string;
}): Promise<GitHubRepo> {
  return githubRequest<GitHubRepo>(
    `/repos/${encodeURIComponent(params.templateOwner)}/${encodeURIComponent(
      params.templateRepo,
    )}/generate`,
    {
      method: "POST",
      body: JSON.stringify({
        owner: params.owner,
        name: params.name,
        description: params.description ?? "",
        // Repository mahasiswa TIDAK PERNAH publik.
        private: false,
        include_all_branches: false,
      }),
    },
  );
}

/**
 * Memberi mahasiswa akses "push" — cukup untuk mengerjakan dan mendorong kode,
 * tetapi tidak untuk menghapus repo atau mengubah pengaturannya.
 */
export async function addCollaborator(params: {
  owner: string;
  repo: string;
  username: string;
  permission?: "pull" | "push" | "maintain";
}): Promise<void> {
  await githubRequest<unknown>(
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
      params.repo,
    )}/collaborators/${encodeURIComponent(params.username)}`,
    {
      method: "PUT",
      body: JSON.stringify({ permission: params.permission ?? "push" }),
    },
  );
}

/** SHA blob sebuah berkas pada ref tertentu; null bila berkas tidak ada. */
export async function getFileSha(params: {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}): Promise<string | null> {
  const query = params.ref ? `?ref=${encodeURIComponent(params.ref)}` : "";
  try {
    const file = await githubRequestOrNull<{ sha?: string; type?: string }>(
      `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
        params.repo,
      )}/contents/${params.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}${query}`,
    );
    if (!file || file.type !== "file" || !file.sha) return null;
    return file.sha;
  } catch (error) {
    // Ref yang tidak ada juga dilaporkan sebagai 404 oleh GitHub.
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}
