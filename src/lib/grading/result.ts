import { z } from "zod";
import type { SubmissionStatus, TestStatus } from "@/lib/db/types";

/**
 * Parsing hasil penilaian — terisolasi di modul ini saja.
 *
 * Sumber datanya adalah result.json yang ditulis checker C++ dan diunggah
 * sebagai artifact GitHub Actions bernama "grading-result". Aplikasi tidak
 * pernah menyimpulkan nilai dari teks log.
 */

const testSchema = z.object({
  name: z.string().min(1).max(300),
  status: z.enum(["PASS", "FAIL", "SKIP"]),
  points: z.coerce.number().finite().default(0),
  message: z.string().max(2000).optional().default(""),
});

const resultSchema = z.object({
  schema_version: z.number().int().optional().default(1),
  score: z.coerce.number().finite(),
  passed: z.coerce.number().int().nonnegative(),
  total: z.coerce.number().int().nonnegative(),
  status: z.enum(["PASS", "FAIL", "ERROR"]),
  error: z.string().max(200).optional(),
  commit_sha: z.string().max(100).optional().default(""),
  timestamp: z.string().max(50).optional().default(""),
  tests: z.array(testSchema).max(500).optional().default([]),
});

export interface GradingTest {
  name: string;
  status: TestStatus;
  points: number;
  message: string;
}

export interface GradingResult {
  schemaVersion: number;
  score: number;
  passed: number;
  total: number;
  status: SubmissionStatus & ("PASS" | "FAIL" | "ERROR");
  error: string | null;
  commitSha: string | null;
  timestamp: string | null;
  tests: GradingTest[];
}

export class GradingResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradingResultError";
  }
}

/**
 * Memvalidasi dan menormalkan result.json.
 *
 * @param maxScore batas atas nilai (default 100). Nilai di luar rentang
 *                 dijepit, bukan ditolak, supaya satu checker yang salah
 *                 hitung tidak menghilangkan seluruh riwayat pengumpulan.
 */
export function parseGradingResult(
  raw: unknown,
  maxScore = 100,
): GradingResult {
  const parsed = resultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GradingResultError(
      `result.json tidak valid: ${parsed.error.issues[0]?.message ?? "bentuk tidak dikenali"}`,
    );
  }

  const data = parsed.data;

  if (data.schema_version !== 1) {
    throw new GradingResultError(
      `Versi skema hasil tidak didukung: ${data.schema_version}.`,
    );
  }

  const total = data.total;
  const passed = Math.min(data.passed, total);
  const score = Math.min(Math.max(Math.round(data.score), 0), maxScore);

  return {
    schemaVersion: data.schema_version,
    score,
    passed,
    total,
    status: data.status,
    error: data.error ?? null,
    commitSha: data.commit_sha || null,
    timestamp: data.timestamp || null,
    tests: data.tests.map((test) => ({
      name: test.name,
      status: test.status,
      points: test.points,
      message: test.message ?? "",
    })),
  };
}

/** Membaca result.json dari teks mentah. */
export function parseGradingResultJson(
  text: string,
  maxScore = 100,
): GradingResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GradingResultError("result.json bukan JSON yang valid.");
  }
  return parseGradingResult(json, maxScore);
}
