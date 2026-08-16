import { describe, expect, it } from "vitest";
import {
  attemptHistory,
  formatScoreTrail,
  summarizeClass,
  summarizeStudent,
} from "@/lib/grading/gradebook";
import type { Submission, SubmissionStatus } from "@/lib/db/types";

let counter = 0;

function submission(
  userId: string,
  score: number | null,
  status: SubmissionStatus,
  submittedAt: string,
): Submission {
  counter += 1;
  return {
    id: `sub-${counter}`,
    assignment_id: "assignment-1",
    user_id: userId,
    student_repository_id: "repo-1",
    commit_sha: "a".repeat(40),
    workflow_run_id: counter,
    run_attempt: 1,
    status,
    score,
    passed_tests: score,
    total_tests: 100,
    html_url: null,
    raw_result: null,
    submitted_at: submittedAt,
    created_at: submittedAt,
    updated_at: submittedAt,
  };
}

/** Riwayat khas: 40 -> 70 -> 100. */
const dimas = [
  submission("dimas", 40, "FAIL", "2026-08-01T00:00:00.000Z"),
  submission("dimas", 70, "FAIL", "2026-08-02T00:00:00.000Z"),
  submission("dimas", 100, "PASS", "2026-08-03T00:00:00.000Z"),
];

/** Nilai sempat turun pada percobaan terakhir. */
const budi = [
  submission("budi", 80, "FAIL", "2026-08-01T00:00:00.000Z"),
  submission("budi", 60, "FAIL", "2026-08-04T00:00:00.000Z"),
];

const all = [...dimas, ...budi];

describe("ringkasan nilai mahasiswa", () => {
  it("menghitung nilai terakhir, terbaik, dan jumlah percobaan", () => {
    const summary = summarizeStudent("dimas", all, "BEST");
    expect(summary.attempts).toBe(3);
    expect(summary.latestScore).toBe(100);
    expect(summary.bestScore).toBe(100);
    expect(summary.status).toBe("PASS");
    expect(summary.lastSubmittedAt).toBe("2026-08-03T00:00:00.000Z");
  });

  it("mode BEST memakai nilai tertinggi walau percobaan terakhir lebih rendah", () => {
    expect(summarizeStudent("budi", all, "BEST").effectiveScore).toBe(80);
  });

  it("mode LATEST memakai nilai percobaan terakhir", () => {
    expect(summarizeStudent("budi", all, "LATEST").effectiveScore).toBe(60);
    expect(summarizeStudent("dimas", all, "LATEST").effectiveScore).toBe(100);
  });

  it("mode FIRST memakai nilai percobaan pertama", () => {
    expect(summarizeStudent("dimas", all, "FIRST").effectiveScore).toBe(40);
    expect(summarizeStudent("budi", all, "FIRST").effectiveScore).toBe(80);
  });

  it("firstScore selalu dihitung, apa pun mode tugasnya", () => {
    // Ketiga nilai selalu tersedia; mode hanya memilih mana yang berlaku.
    const summary = summarizeStudent("dimas", all, "LATEST");
    expect(summary.firstScore).toBe(40);
    expect(summary.bestScore).toBe(100);
    expect(summary.latestScore).toBe(100);
  });

  it("mode FIRST memakai percobaan yang sudah dinilai, bukan yang masih berjalan", () => {
    // Percobaan pertama masih RUNNING saat percobaan kedua selesai: yang
    // berlaku adalah nilai pertama yang benar-benar ada, bukan null.
    const eka = [
      submission("eka", null, "RUNNING", "2026-08-01T00:00:00.000Z"),
      submission("eka", 55, "FAIL", "2026-08-02T00:00:00.000Z"),
      submission("eka", 90, "PASS", "2026-08-03T00:00:00.000Z"),
    ];
    expect(summarizeStudent("eka", eka, "FIRST").effectiveScore).toBe(55);
  });

  it("mode FIRST tetap null bila belum ada percobaan yang dinilai", () => {
    const fani = [submission("fani", null, "QUEUED", "2026-08-01T00:00:00.000Z")];
    expect(summarizeStudent("fani", fani, "FIRST").effectiveScore).toBeNull();
  });

  it("mode FIRST mempertahankan nilai 0 sebagai nilai yang sah", () => {
    // 0 adalah nilai, bukan "kosong". Praktikan yang percobaan pertamanya
    // benar-benar 0 memang mendapat 0 — inilah konsekuensi mode FIRST.
    const gani = [
      submission("gani", 0, "FAIL", "2026-08-01T00:00:00.000Z"),
      submission("gani", 100, "PASS", "2026-08-02T00:00:00.000Z"),
    ];
    expect(summarizeStudent("gani", gani, "FIRST").effectiveScore).toBe(0);
  });

  it("mahasiswa tanpa pengumpulan berstatus NOT_SUBMITTED", () => {
    const summary = summarizeStudent("andi", all, "BEST");
    expect(summary).toMatchObject({
      attempts: 0,
      latestScore: null,
      bestScore: null,
      effectiveScore: null,
      lastSubmittedAt: null,
      status: "NOT_SUBMITTED",
    });
  });

  it("hanya menghitung data mahasiswa yang bersangkutan", () => {
    // Data Budi tidak boleh mempengaruhi ringkasan Dimas.
    expect(summarizeStudent("dimas", all, "BEST").attempts).toBe(3);
    expect(summarizeStudent("budi", all, "BEST").attempts).toBe(2);
  });

  it("percobaan yang masih berjalan tidak dihitung sebagai nilai", () => {
    const running = [
      submission("citra", 90, "PASS", "2026-08-01T00:00:00.000Z"),
      submission("citra", null, "RUNNING", "2026-08-05T00:00:00.000Z"),
    ];
    const summary = summarizeStudent("citra", running, "LATEST");
    expect(summary.attempts).toBe(2);
    expect(summary.latestScore).toBe(90);
    expect(summary.status).toBe("RUNNING");
  });

  it("compile error tetap tercatat sebagai percobaan dengan nilai 0", () => {
    const error = [
      submission("eka", 0, "ERROR", "2026-08-01T00:00:00.000Z"),
      submission("eka", 55, "FAIL", "2026-08-02T00:00:00.000Z"),
    ];
    const summary = summarizeStudent("eka", error, "BEST");
    expect(summary.attempts).toBe(2);
    expect(summary.bestScore).toBe(55);
    expect(summary.latestScore).toBe(55);
  });
});

describe("riwayat percobaan", () => {
  it("terurut dari yang paling lama", () => {
    expect(
      attemptHistory("dimas", all).map((entry) => entry.score),
    ).toEqual([40, 70, 100]);
  });

  it("ditampilkan sebagai 40 → 70 → 100", () => {
    expect(formatScoreTrail(attemptHistory("dimas", all))).toBe("40 → 70 → 100");
    expect(formatScoreTrail([])).toBe("—");
  });
});

describe("gradebook satu kelas", () => {
  it("mengembalikan satu baris untuk setiap mahasiswa, termasuk yang belum mengumpulkan", () => {
    const rows = summarizeClass(["dimas", "budi", "andi"], all, "BEST");

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.effectiveScore)).toEqual([100, 80, null]);
    expect(rows.map((row) => row.attempts)).toEqual([3, 2, 0]);
    expect(rows[2].status).toBe("NOT_SUBMITTED");
  });
});
