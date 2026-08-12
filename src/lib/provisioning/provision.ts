import "server-only";

import { env } from "@/lib/env";
import { getTemplate } from "@/lib/db/assignments";
import { findRepository, upsertRepository } from "@/lib/db/repositories";
import { addCollaborator, generateFromTemplate, getRepo } from "@/lib/github/repos";
import { studentRepoName } from "@/lib/github/naming";
import type { Assignment, StudentRepository, User } from "@/lib/db/types";

/**
 * Menyediakan repository privat milik seorang mahasiswa untuk sebuah tugas.
 *
 * Aman dijalankan berulang:
 *   - kalau repo sudah tercatat dan masih ada di GitHub, hanya izin akses
 *     mahasiswa yang dipastikan ulang;
 *   - kalau repo ada di GitHub tapi belum tercatat, repo tersebut diadopsi
 *     (tidak pernah membuat duplikat);
 *   - kalau belum ada sama sekali, repo dibuat dari template.
 *
 * Tidak ada rahasia apa pun yang ditulis ke repository mahasiswa.
 */
export async function provisionRepository(params: {
  assignment: Assignment;
  student: User;
}): Promise<StudentRepository> {
  const { assignment, student } = params;

  const owner = env.githubOrg;
  const name = studentRepoName(assignment.meeting_number, student.github_login);
  const fullName = `${owner}/${name}`;

  const base = {
    assignmentId: assignment.id,
    userId: student.id,
    owner,
    name,
    fullName,
  };

  try {
    if (!assignment.template_id) {
      throw new Error(
        "Tugas ini belum memiliki repository template. Atur template terlebih dahulu.",
      );
    }
    const template = await getTemplate(assignment.template_id);
    if (!template) throw new Error("Template tugas tidak ditemukan.");

    // 1. Repo sudah ada di GitHub? (baik hasil provisioning sebelumnya maupun
    //    dibuat manual). Jangan pernah berasumsi repo sudah/belum ada.
    let repo = await getRepo(owner, name);

    // 2. Belum ada -> buat dari template.
    if (!repo) {
      repo = await generateFromTemplate({
        templateOwner: template.owner,
        templateRepo: template.repo,
        owner,
        name,
        description: `${assignment.title} — @${student.github_login}`,
      });
    }

    // 3. Pastikan mahasiswa punya akses push (idempoten di sisi GitHub).
    await addCollaborator({
      owner,
      repo: name,
      username: student.github_login,
      permission: "push",
    });

    return await upsertRepository({
      ...base,
      githubRepoId: repo.id,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch || "main",
      status: "READY",
      provisionError: null,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[provision]", fullName, detail);

    // Catat kegagalan supaya asisten bisa melihat dan mencoba ulang.
    await upsertRepository({
      ...base,
      status: "FAILED",
      provisionError: detail.slice(0, 500),
    });
    throw error;
  }
}

/** Menyediakan repo untuk banyak mahasiswa sekaligus (satu kelas). */
export async function provisionMany(params: {
  assignment: Assignment;
  students: User[];
}): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  // Berurutan, bukan paralel: menjaga rate limit GitHub dan tetap ringan
  // untuk ukuran kelas ~20 mahasiswa.
  for (const student of params.students) {
    const existing = await findRepository(params.assignment.id, student.id);
    if (existing?.status === "READY") {
      ok++;
      continue;
    }
    try {
      await provisionRepository({ assignment: params.assignment, student });
      ok++;
    } catch (error) {
      failed++;
      errors.push(
        `@${student.github_login}: ${
          error instanceof Error ? error.message : "gagal"
        }`,
      );
    }
  }

  return { ok, failed, errors };
}
