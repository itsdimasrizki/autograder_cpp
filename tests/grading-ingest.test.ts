import { describe, expect, it } from "vitest";
import { MemoryStore } from "./helpers/memory-store";
import {
  buildSubmissionRecord,
  deriveStatus,
  ingestGradingRun,
  type RunInfo,
} from "@/lib/grading/ingest";
import { parseGradingResult } from "@/lib/grading/result";

const ASSIGNMENT = "assignment-1";
const USER = "user-dimas";
const REPO = "repo-1";

function makeRun(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    runId: 1001,
    runAttempt: 1,
    headSha: "c".repeat(40),
    status: "completed",
    conclusion: "success",
    htmlUrl: "https://github.com/org/praktikum-01-dimas/actions/runs/1001",
    updatedAt: "2026-08-12T10:00:00.000Z",
    ...overrides,
  };
}

function makeResult(score: number, passed: number, total: number) {
  return parseGradingResult({
    schema_version: 1,
    score,
    passed,
    total,
    status: passed === total ? "PASS" : "FAIL",
    commit_sha: "c".repeat(40),
    timestamp: "2026-08-12T10:00:00Z",
    tests: Array.from({ length: total }, (_, index) => ({
      name: `test ${index + 1}`,
      status: index < passed ? "PASS" : "FAIL",
      points: index < passed ? 100 / total : 0,
      message: index < passed ? "" : "nilai tidak sesuai",
    })),
  });
}

async function ingest(
  store: MemoryStore,
  run: RunInfo,
  result: ReturnType<typeof makeResult> | null,
) {
  return ingestGradingRun({
    store,
    assignmentId: ASSIGNMENT,
    userId: USER,
    studentRepositoryId: REPO,
    run,
    result,
  });
}

describe("penyimpanan nilai", () => {
  it("menyimpan score 100 dengan benar", async () => {
    const store = new MemoryStore();
    const outcome = await ingest(store, makeRun(), makeResult(100, 10, 10));

    expect(outcome.created).toBe(true);
    expect(outcome.submission.score).toBe(100);
    expect(outcome.submission.passed_tests).toBe(10);
    expect(outcome.submission.total_tests).toBe(10);
    expect(outcome.submission.status).toBe("PASS");
    expect(store.testResults.get(outcome.submission.id)).toHaveLength(10);
  });

  it("menyimpan score 71 dengan benar", async () => {
    const store = new MemoryStore();
    const outcome = await ingest(store, makeRun(), makeResult(71, 71, 100));

    expect(outcome.submission.score).toBe(71);
    expect(outcome.submission.passed_tests).toBe(71);
    expect(outcome.submission.total_tests).toBe(100);
    expect(outcome.submission.status).toBe("FAIL");
  });

  it("menyimpan commit SHA dan run id", async () => {
    const store = new MemoryStore();
    const outcome = await ingest(store, makeRun(), makeResult(100, 5, 5));

    expect(outcome.submission.commit_sha).toBe("c".repeat(40));
    expect(outcome.submission.workflow_run_id).toBe(1001);
  });
});

describe("idempotensi event GitHub Actions", () => {
  it("event ganda tidak membuat submission ganda", async () => {
    const store = new MemoryStore();
    const run = makeRun();
    const result = makeResult(100, 10, 10);

    const first = await ingest(store, run, result);
    const second = await ingest(store, run, result);
    const third = await ingest(store, run, result);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(store.submissions).toHaveLength(1);
    expect(store.insertCount).toBe(1);
    expect(second.submission.id).toBe(first.submission.id);
  });

  it("memperbarui baris yang sama saat hasil akhirnya tersedia", async () => {
    const store = new MemoryStore();

    // Webhook pertama: run baru dimulai, belum ada hasil.
    const queued = await ingest(
      store,
      makeRun({ status: "in_progress", conclusion: null }),
      null,
    );
    expect(queued.submission.status).toBe("RUNNING");
    expect(queued.submission.score).toBeNull();

    // Webhook kedua: run selesai dengan hasil.
    const done = await ingest(store, makeRun(), makeResult(80, 8, 10));

    expect(store.submissions).toHaveLength(1);
    expect(done.created).toBe(false);
    expect(done.updated).toBe(true);
    expect(done.submission.id).toBe(queued.submission.id);
    expect(done.submission.score).toBe(80);
    expect(done.submission.status).toBe("FAIL");
  });

  it("event terlambat tidak menghapus nilai yang sudah final", async () => {
    const store = new MemoryStore();

    await ingest(store, makeRun(), makeResult(100, 10, 10));
    // Kiriman ulang yang terlambat, tanpa hasil dan berstatus queued.
    const late = await ingest(
      store,
      makeRun({ status: "queued", conclusion: null }),
      null,
    );

    expect(late.updated).toBe(false);
    expect(late.submission.score).toBe(100);
    expect(late.submission.status).toBe("PASS");
  });

  it("percobaan ulang (run_attempt) dicatat terpisah", async () => {
    const store = new MemoryStore();

    await ingest(store, makeRun({ runAttempt: 1 }), makeResult(40, 4, 10));
    await ingest(store, makeRun({ runAttempt: 2 }), makeResult(70, 7, 10));

    expect(store.submissions).toHaveLength(2);
  });
});

describe("riwayat pengumpulan", () => {
  it("setiap push tersimpan sebagai percobaan terpisah", async () => {
    const store = new MemoryStore();

    await ingest(
      store,
      makeRun({ runId: 1, updatedAt: "2026-08-01T00:00:00.000Z" }),
      makeResult(40, 4, 10),
    );
    await ingest(
      store,
      makeRun({ runId: 2, updatedAt: "2026-08-02T00:00:00.000Z" }),
      makeResult(70, 7, 10),
    );
    await ingest(
      store,
      makeRun({ runId: 3, updatedAt: "2026-08-03T00:00:00.000Z" }),
      makeResult(100, 10, 10),
    );

    expect(store.submissions.map((s) => s.score)).toEqual([40, 70, 100]);
  });
});

describe("penentuan status", () => {
  it("mengikuti hasil checker bila tersedia", () => {
    expect(deriveStatus(makeRun(), makeResult(100, 10, 10))).toBe("PASS");
    expect(deriveStatus(makeRun(), makeResult(50, 5, 10))).toBe("FAIL");
  });

  it("run yang belum selesai berstatus QUEUED/RUNNING", () => {
    expect(
      deriveStatus(makeRun({ status: "queued", conclusion: null }), null),
    ).toBe("QUEUED");
    expect(
      deriveStatus(makeRun({ status: "in_progress", conclusion: null }), null),
    ).toBe("RUNNING");
  });

  it("run selesai tanpa hasil dianggap ERROR, bukan diabaikan", () => {
    expect(deriveStatus(makeRun({ conclusion: "failure" }), null)).toBe("ERROR");
    expect(deriveStatus(makeRun({ conclusion: "success" }), null)).toBe("ERROR");
  });
});

describe("penyusunan baris submission", () => {
  it("memakai SHA dari GitHub, bukan dari result.json", () => {
    const record = buildSubmissionRecord({
      assignmentId: ASSIGNMENT,
      userId: USER,
      studentRepositoryId: REPO,
      run: makeRun({ headSha: "b".repeat(40) }),
      result: makeResult(100, 1, 1),
    });
    expect(record.commitSha).toBe("b".repeat(40));
  });
});
