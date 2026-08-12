import "server-only";

import { getInstallationToken } from "@/lib/github/app";

/**
 * Pembungkus tipis GitHub REST API.
 *
 * Seluruh integrasi GitHub terisolasi di folder ini (src/lib/github/*);
 * bagian lain aplikasi tidak pernah memanggil api.github.com langsung.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export async function githubRequest<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
): Promise<T> {
  const token = await getInstallationToken();

  const response = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "web-strukdat",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GitHubError(
      `GitHub API ${init.method ?? "GET"} ${path} gagal (HTTP ${response.status}).`,
      response.status,
      body,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Seperti githubRequest tapi mengembalikan null untuk 404. */
export async function githubRequestOrNull<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  try {
    return await githubRequest<T>(path, init);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Mengunduh biner (dipakai untuk artifact zip).
 *
 * GitHub membalas 302 ke URL bertanda tangan di host lain. Redirect diikuti
 * secara manual TANPA header Authorization supaya token App tidak bocor ke
 * host penyimpanan.
 */
export async function githubDownload(path: string): Promise<Buffer> {
  const token = await getInstallationToken();

  const response = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "web-strukdat",
    },
    redirect: "manual",
    cache: "no-store",
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new GitHubError("Redirect unduhan tanpa header Location.", 500, "");
    }
    const signed = await fetch(location, { cache: "no-store" });
    if (!signed.ok) {
      throw new GitHubError(
        `Gagal mengunduh artifact (HTTP ${signed.status}).`,
        signed.status,
        "",
      );
    }
    return Buffer.from(await signed.arrayBuffer());
  }

  if (!response.ok) {
    throw new GitHubError(
      `Gagal mengunduh (HTTP ${response.status}).`,
      response.status,
      await response.text(),
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
