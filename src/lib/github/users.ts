import "server-only";

import { githubRequestOrNull } from "@/lib/github/client";
import { isValidGitHubLogin } from "@/lib/github/naming";

export interface GitHubUserSummary {
  githubUserId: number;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Memverifikasi bahwa sebuah username GitHub benar-benar ada, sekaligus
 * mengambil ID numeriknya. Dipakai saat asisten menambahkan mahasiswa,
 * supaya identitas tidak pernah berasal dari ketikan bebas.
 */
export async function lookupGitHubUser(
  login: string,
): Promise<GitHubUserSummary | null> {
  if (!isValidGitHubLogin(login)) return null;

  const user = await githubRequestOrNull<{
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
    type: string;
  }>(`/users/${encodeURIComponent(login)}`);

  if (!user || user.type !== "User") return null;

  return {
    githubUserId: user.id,
    githubLogin: user.login,
    displayName: user.name,
    avatarUrl: user.avatar_url,
  };
}
