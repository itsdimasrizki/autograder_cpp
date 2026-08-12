/**
 * Aturan penamaan repository mahasiswa. Murni agar bisa diuji.
 *
 * Contoh: pertemuan 1 + username "dimas" -> "praktikum-01-dimas"
 */

/** Username GitHub: alfanumerik dan tanda hubung, maksimal 39 karakter. */
const GITHUB_LOGIN = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export function isValidGitHubLogin(login: string): boolean {
  return GITHUB_LOGIN.test(login);
}

export function studentRepoName(
  meetingNumber: number,
  githubLogin: string,
): string {
  if (!Number.isInteger(meetingNumber) || meetingNumber < 1) {
    throw new Error("Nomor pertemuan tidak valid.");
  }
  if (!isValidGitHubLogin(githubLogin)) {
    throw new Error(`Username GitHub tidak valid: ${githubLogin}`);
  }
  return `praktikum-${String(meetingNumber).padStart(2, "0")}-${githubLogin.toLowerCase()}`;
}

/** "org/repo" -> { owner, repo }; null kalau formatnya salah. */
export function parseFullName(
  fullName: string,
): { owner: string; repo: string } | null {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}
