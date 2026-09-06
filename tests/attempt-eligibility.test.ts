import { describe, expect, it } from "vitest";
import { evaluateAttempts, summarizeStudent } from "@/lib/grading/gradebook";
import type { ResolvedAssignmentConfig } from "@/lib/grading/config";
import type { ScoringMode, Submission, SubmissionStatus } from "@/lib/db/types";

let counter = 0;

function submission(
  score: number | null,
  status: SubmissionStatus,
  submittedAt: string,
): Submission {
  counter += 1;
  return {
    id: `sub-${counter}`,
    assignment_id: "assignment-1",
    user_id: "dimas",
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

function config(
  patch: Partial<ResolvedAssignmentConfig> = {},
): ResolvedAssignmentConfig {
  return {
    deadline: null,
    maxAttempts: null,
    scoringMode: "BEST" as ScoringMode,
    source: "DASAR",
    ...patch,
  };
}

// Tenggat 20:00 WIB = 13:00 UTC.
const TENGGAT = "2026-09-07T13:00:00.000Z";

describe("kelayakan percobaan", () => {
  it("tanpa tenggat dan tanpa kuota, semua percobaan yang dinilai dihitung", () => {
    const hasil = evaluateAttempts(
      [
        submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
        submission(85, "FAIL", "2026-09-07T12:10:00.000Z"),
      ],
      config(),
    );
    expect(hasil.map((a) => a.eligible)).toEqual([true, true]);
    expect(hasil.map((a) => a.exclusion)).toEqual([null, null]);
  });

  it("hanya kuota yang menyaring; tenggat hanya menandai", () => {
    // Kuota 1, tenggat 20:00 WIB, mode nilai terbaik.
    const percobaan = [
      submission(60, "FAIL", "2026-09-07T11:30:00.000Z"), // 18:30 WIB
      submission(85, "FAIL", "2026-09-07T12:10:00.000Z"), // 19:10 WIB
      submission(100, "PASS", "2026-09-07T14:00:00.000Z"), // 21:00 WIB
    ];
    const cfg = config({ deadline: TENGGAT, maxAttempts: 1 });

    const hasil = evaluateAttempts(percobaan, cfg);
    expect(hasil.map((a) => a.eligible)).toEqual([true, false, false]);
    expect(hasil.map((a) => a.exclusion)).toEqual([
      null,
      "LEWAT_KUOTA",
      "LEWAT_KUOTA",
    ]);
    // Keterlambatan dibawa terpisah, tidak ikut membatalkan kelayakan.
    expect(hasil.map((a) => a.late)).toEqual([false, false, true]);

    expect(summarizeStudent("dimas", percobaan, cfg).effectiveScore).toBe(60);
  });

  it("percobaan terlambat tetap dihitung bila kuota masih tersisa", () => {
    // Inti aturannya: aplikasi tidak pernah membuang nilai karena telat.
    // Asisten yang memutuskan, aplikasi hanya memberi tahu.
    const percobaan = [
      submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
      submission(100, "PASS", "2026-09-07T14:00:00.000Z"), // lewat tenggat
    ];
    const cfg = config({ deadline: TENGGAT, scoringMode: "BEST" });

    const hasil = evaluateAttempts(percobaan, cfg);
    expect(hasil.map((a) => a.eligible)).toEqual([true, true]);
    expect(hasil.map((a) => a.exclusion)).toEqual([null, null]);
    expect(hasil[1].late).toBe(true);

    const ringkasan = summarizeStudent("dimas", percobaan, cfg);
    expect(ringkasan.effectiveScore).toBe(100);
    expect(ringkasan.countedAttempts).toBe(2);
  });

  it("percobaan tepat waktu tetap lewat kuota bila kuotanya sudah habis", () => {
    const hasil = evaluateAttempts(
      [
        submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
        submission(85, "FAIL", "2026-09-07T12:10:00.000Z"),
      ],
      config({ deadline: TENGGAT, maxAttempts: 1 }),
    );
    expect(hasil[1].late).toBe(false);
    expect(hasil[1].overQuota).toBe(true);
    expect(hasil[1].exclusion).toBe("LEWAT_KUOTA");
  });

  it("tepat pada detik tenggat belum terhitung terlambat", () => {
    const hasil = evaluateAttempts(
      [submission(70, "PASS", TENGGAT)],
      config({ deadline: TENGGAT }),
    );
    expect(hasil[0].late).toBe(false);
    expect(hasil[0].eligible).toBe(true);
  });

  it("percobaan yang belum dinilai tidak memakan jatah kuota", () => {
    // Push pertama gagal kompilasi tanpa nilai; praktikan dengan kuota 1 tetap
    // punya satu kesempatan sungguhan.
    const percobaan = [
      submission(null, "ERROR", "2026-09-07T11:30:00.000Z"),
      submission(70, "PASS", "2026-09-07T11:45:00.000Z"),
      submission(90, "PASS", "2026-09-07T12:20:00.000Z"),
    ];
    const cfg = config({ maxAttempts: 1, scoringMode: "FIRST" });

    const hasil = evaluateAttempts(percobaan, cfg);
    expect(hasil.map((a) => a.exclusion)).toEqual([
      "BELUM_DINILAI",
      null,
      "LEWAT_KUOTA",
    ]);
    expect(hasil.map((a) => a.quotaNumber)).toEqual([null, 1, 2]);
    expect(summarizeStudent("dimas", percobaan, cfg).effectiveScore).toBe(70);
  });

  it("percobaan yang masih berjalan juga tidak memakan jatah kuota", () => {
    const hasil = evaluateAttempts(
      [
        submission(null, "RUNNING", "2026-09-07T11:30:00.000Z"),
        submission(null, "QUEUED", "2026-09-07T11:31:00.000Z"),
        submission(55, "FAIL", "2026-09-07T11:45:00.000Z"),
      ],
      config({ maxAttempts: 1 }),
    );
    expect(hasil[2].eligible).toBe(true);
    expect(hasil[2].quotaNumber).toBe(1);
  });

  it("ERROR yang punya nilai tetap memakan jatah kuota", () => {
    // Compile error yang tercatat bernilai 0 adalah percobaan yang sudah
    // dinilai, jadi berbeda dari ERROR tanpa nilai.
    const hasil = evaluateAttempts(
      [
        submission(0, "ERROR", "2026-09-07T11:30:00.000Z"),
        submission(90, "PASS", "2026-09-07T11:45:00.000Z"),
      ],
      config({ maxAttempts: 1 }),
    );
    expect(hasil[0].quotaNumber).toBe(1);
    expect(hasil[1].exclusion).toBe("LEWAT_KUOTA");
  });

  it("mengurutkan percobaan dari yang paling lama sebelum menyaring", () => {
    const hasil = evaluateAttempts(
      [
        submission(90, "PASS", "2026-09-07T12:20:00.000Z"),
        submission(70, "PASS", "2026-09-07T11:45:00.000Z"),
      ],
      config({ maxAttempts: 1 }),
    );
    expect(hasil[0].submission.score).toBe(70);
    expect(hasil[0].eligible).toBe(true);
    expect(hasil[1].eligible).toBe(false);
  });

  it("memakai workflow_run_id sebagai pemecah seri saat waktunya sama persis", () => {
    const pertama = submission(70, "PASS", "2026-09-07T11:45:00.000Z");
    const kedua = submission(90, "PASS", "2026-09-07T11:45:00.000Z");
    const hasil = evaluateAttempts([kedua, pertama], config({ maxAttempts: 1 }));
    expect(hasil[0].submission.id).toBe(pertama.id);
  });

  it("tidak mengubah array yang diterimanya", () => {
    const percobaan = [
      submission(90, "PASS", "2026-09-07T12:20:00.000Z"),
      submission(70, "PASS", "2026-09-07T11:45:00.000Z"),
    ];
    const urutanAwal = percobaan.map((s) => s.id);
    evaluateAttempts(percobaan, config());
    expect(percobaan.map((s) => s.id)).toEqual(urutanAwal);
  });

  it("tenggat yang tidak valid tidak menandai apa pun sebagai terlambat", () => {
    const hasil = evaluateAttempts(
      [submission(70, "PASS", "2026-09-07T14:00:00.000Z")],
      config({ deadline: "bukan tanggal" }),
    );
    expect(hasil[0].late).toBe(false);
    expect(hasil[0].eligible).toBe(true);
  });
});

describe("ringkasan setelah penyaringan", () => {
  const percobaan = [
    submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
    submission(85, "FAIL", "2026-09-07T12:10:00.000Z"),
    submission(100, "PASS", "2026-09-07T14:00:00.000Z"),
  ];
  const cfg = config({ deadline: TENGGAT, maxAttempts: 1 });

  it("attempts menghitung seluruh push, countedAttempts hanya yang layak", () => {
    const ringkasan = summarizeStudent("dimas", percobaan, cfg);
    expect(ringkasan.attempts).toBe(3);
    expect(ringkasan.countedAttempts).toBe(1);
  });

  it("lastSubmittedAt menunjuk push terakhir apa pun, layak atau tidak", () => {
    // Kolom "Pengumpulan Terakhir" menjawab kapan orang ini terakhir menyentuh
    // tugasnya, bukan kapan nilainya terbentuk.
    expect(summarizeStudent("dimas", percobaan, cfg).lastSubmittedAt).toBe(
      "2026-09-07T14:00:00.000Z",
    );
  });

  it("ketiga nilai dihitung dari himpunan yang layak saja", () => {
    const ringkasan = summarizeStudent("dimas", percobaan, cfg);
    expect(ringkasan.firstScore).toBe(60);
    expect(ringkasan.latestScore).toBe(60);
    expect(ringkasan.bestScore).toBe(60);
  });

  it("tanpa satu pun percobaan yang dinilai, nilainya null tapi status terlihat", () => {
    const belumDinilai = [submission(null, "RUNNING", "2026-09-07T14:00:00.000Z")];
    const ringkasan = summarizeStudent(
      "dimas",
      belumDinilai,
      config({ deadline: TENGGAT }),
    );
    expect(ringkasan.effectiveScore).toBeNull();
    expect(ringkasan.countedAttempts).toBe(0);
    expect(ringkasan.attempts).toBe(1);
    expect(ringkasan.status).toBe("RUNNING");
  });
});

describe("penanda terlambat pada nilai yang berlaku", () => {
  const tepatWaktu = submission(60, "FAIL", "2026-09-07T11:30:00.000Z");
  const telat = submission(100, "PASS", "2026-09-07T14:00:00.000Z");

  it("menyala saat nilai berlaku berasal dari push yang telat", () => {
    // Mode terbaik memilih 100 yang telat, jadi asisten harus diberi tahu.
    const ringkasan = summarizeStudent(
      "dimas",
      [tepatWaktu, telat],
      config({ deadline: TENGGAT, scoringMode: "BEST" }),
    );
    expect(ringkasan.effectiveScore).toBe(100);
    expect(ringkasan.effectiveLate).toBe(true);
  });

  it("padam saat nilai berlaku berasal dari push tepat waktu", () => {
    // Orang yang sama, mode nilai pertama: yang berlaku 60 dan tepat waktu,
    // jadi tidak ada yang perlu diputuskan asisten meski ia pernah telat.
    const ringkasan = summarizeStudent(
      "dimas",
      [tepatWaktu, telat],
      config({ deadline: TENGGAT, scoringMode: "FIRST" }),
    );
    expect(ringkasan.effectiveScore).toBe(60);
    expect(ringkasan.effectiveLate).toBe(false);
  });

  it("padam bila tugas memang tidak punya tenggat", () => {
    const ringkasan = summarizeStudent(
      "dimas",
      [tepatWaktu, telat],
      config({ scoringMode: "LATEST" }),
    );
    expect(ringkasan.effectiveScore).toBe(100);
    expect(ringkasan.effectiveLate).toBe(false);
  });

  it("nilai tertinggi yang seri dimenangkan percobaan yang lebih awal", () => {
    // Yang lebih awal lebih kecil kemungkinannya telat, jadi penandanya tidak
    // menyala tanpa alasan.
    const seriTepatWaktu = submission(90, "PASS", "2026-09-07T11:30:00.000Z");
    const seriTelat = submission(90, "PASS", "2026-09-07T14:00:00.000Z");
    const ringkasan = summarizeStudent(
      "dimas",
      [seriTepatWaktu, seriTelat],
      config({ deadline: TENGGAT, scoringMode: "BEST" }),
    );
    expect(ringkasan.effectiveScore).toBe(90);
    expect(ringkasan.effectiveLate).toBe(false);
  });
});
