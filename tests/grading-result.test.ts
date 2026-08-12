import { describe, expect, it } from "vitest";
import {
  GradingResultError,
  parseGradingResult,
  parseGradingResultJson,
} from "@/lib/grading/result";
import { listZipEntries, readZipFile, ZipError } from "@/lib/grading/unzip";
import {
  parseWorkflowRunEvent,
  verifyWebhookSignature,
} from "@/lib/github/webhook";
import { createHmac } from "node:crypto";

// Artifact ZIP sungguhan (dibuat dengan zipfile Python), berisi result.json
// dengan score 71 dari 7 test.
const DEFLATED_ZIP =
  "UEsDBBQAAAAIANmiDF0Z8ux91AAAAIsDAAALAAAAcmVzdWx0Lmpzb269kj8LwjAQxXc/RcjcShJb/21dBMFBqJMicmiwBdOUJrqUfncvqVQERQdpCAfv5e79bkg9IISaYyYVHG6yMrku6JzwoLV1JVFNWlmCMfKEOvbSagsX99r2WrBXg5IukuWKeu+olcrtwWTgfPjxtLM2VxIzVelGBRPjkE1DLjaczZm720cbNjnqDgUhta9oF6Dc4tQy3+a954brJE2ffqnzwmfwaChmnY14A2efQr3XBB8YvAeG6IEx6oER9cCI3zG6X/nKYO/yDVwg+wIZ/xOCdT9o7lBLAQIUAxQAAAAIANmiDF0Z8ux91AAAAIsDAAALAAAAAAAAAAAAAACAAQAAAAByZXN1bHQuanNvblBLBQYAAAAAAQABADkAAAD9AAAAAAA=";

// Varian tanpa kompresi (stored) dan berada di dalam sub-direktori.
const STORED_NESTED_ZIP =
  "UEsDBBQAAAAAANmiDF0Z8ux9iwMAAIsDAAAUAAAAYXJ0aWZhY3QvcmVzdWx0Lmpzb257CiAgInNjaGVtYV92ZXJzaW9uIjogMSwKICAic2NvcmUiOiA3MSwKICAicGFzc2VkIjogNSwKICAidG90YWwiOiA3LAogICJzdGF0dXMiOiAiRkFJTCIsCiAgImNvbW1pdF9zaGEiOiAiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSIsCiAgInRpbWVzdGFtcCI6ICIyMDI2LTA4LTEyVDEwOjAwOjAwWiIsCiAgInRlc3RzIjogWwogICAgewogICAgICAibmFtZSI6ICJ0MCIsCiAgICAgICJzdGF0dXMiOiAiUEFTUyIsCiAgICAgICJwb2ludHMiOiAxNC4yOSwKICAgICAgIm1lc3NhZ2UiOiAiIgogICAgfSwKICAgIHsKICAgICAgIm5hbWUiOiAidDEiLAogICAgICAic3RhdHVzIjogIlBBU1MiLAogICAgICAicG9pbnRzIjogMTQuMjksCiAgICAgICJtZXNzYWdlIjogIiIKICAgIH0sCiAgICB7CiAgICAgICJuYW1lIjogInQyIiwKICAgICAgInN0YXR1cyI6ICJQQVNTIiwKICAgICAgInBvaW50cyI6IDE0LjI5LAogICAgICAibWVzc2FnZSI6ICIiCiAgICB9LAogICAgewogICAgICAibmFtZSI6ICJ0MyIsCiAgICAgICJzdGF0dXMiOiAiUEFTUyIsCiAgICAgICJwb2ludHMiOiAxNC4yOSwKICAgICAgIm1lc3NhZ2UiOiAiIgogICAgfSwKICAgIHsKICAgICAgIm5hbWUiOiAidDQiLAogICAgICAic3RhdHVzIjogIlBBU1MiLAogICAgICAicG9pbnRzIjogMTQuMjksCiAgICAgICJtZXNzYWdlIjogIiIKICAgIH0sCiAgICB7CiAgICAgICJuYW1lIjogInQ1IiwKICAgICAgInN0YXR1cyI6ICJGQUlMIiwKICAgICAgInBvaW50cyI6IDAsCiAgICAgICJtZXNzYWdlIjogInNhbGFoIgogICAgfSwKICAgIHsKICAgICAgIm5hbWUiOiAidDYiLAogICAgICAic3RhdHVzIjogIkZBSUwiLAogICAgICAicG9pbnRzIjogMCwKICAgICAgIm1lc3NhZ2UiOiAic2FsYWgiCiAgICB9CiAgXQp9UEsBAhQDFAAAAAAA2aIMXRny7H2LAwAAiwMAABQAAAAAAAAAAAAAAIABAAAAAGFydGlmYWN0L3Jlc3VsdC5qc29uUEsFBgAAAAABAAEAQgAAAL0DAAAAAA==";

const validResult = {
  schema_version: 1,
  score: 100,
  passed: 10,
  total: 10,
  status: "PASS",
  commit_sha: "a".repeat(40),
  timestamp: "2026-08-12T10:00:00Z",
  tests: [
    { name: "tambah(2,3)", status: "PASS", points: 10, message: "" },
  ],
};

describe("parsing result.json", () => {
  it("menerima hasil yang valid", () => {
    const result = parseGradingResult(validResult);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(10);
    expect(result.total).toBe(10);
    expect(result.status).toBe("PASS");
    expect(result.tests).toHaveLength(1);
  });

  it("menerima nilai parsial seperti 71", () => {
    const result = parseGradingResult({
      ...validResult,
      score: 71,
      passed: 71,
      total: 100,
      status: "FAIL",
    });
    expect(result.score).toBe(71);
    expect(result.status).toBe("FAIL");
  });

  it("menjepit nilai di luar rentang, bukan membuang hasilnya", () => {
    expect(parseGradingResult({ ...validResult, score: 250 }).score).toBe(100);
    expect(parseGradingResult({ ...validResult, score: -5 }).score).toBe(0);
    // max_score tugas dihormati.
    expect(parseGradingResult({ ...validResult, score: 90 }, 50).score).toBe(50);
  });

  it("membatasi passed agar tidak melebihi total", () => {
    const result = parseGradingResult({
      ...validResult,
      passed: 99,
      total: 10,
    });
    expect(result.passed).toBe(10);
  });

  it("menerima hasil status ERROR dari compile error", () => {
    const result = parseGradingResult({
      schema_version: 1,
      score: 0,
      passed: 0,
      total: 0,
      status: "ERROR",
      error: "COMPILE_ERROR",
      commit_sha: "a".repeat(40),
      timestamp: "2026-08-12T10:00:00Z",
      tests: [
        {
          name: "Kode mahasiswa gagal dikompilasi.",
          status: "FAIL",
          points: 0,
          message: "error: expected ';'",
        },
      ],
    });
    expect(result.status).toBe("ERROR");
    expect(result.score).toBe(0);
    expect(result.error).toBe("COMPILE_ERROR");
  });

  it("menolak bentuk yang tidak dikenali", () => {
    expect(() => parseGradingResult(null)).toThrow(GradingResultError);
    expect(() => parseGradingResult({})).toThrow(GradingResultError);
    expect(() => parseGradingResult({ ...validResult, status: "OK" })).toThrow(
      GradingResultError,
    );
    expect(() => parseGradingResultJson("bukan json")).toThrow(
      GradingResultError,
    );
  });

  it("menolak versi skema yang tidak didukung", () => {
    expect(() =>
      parseGradingResult({ ...validResult, schema_version: 2 }),
    ).toThrow(/skema/i);
  });
});

describe("pembacaan artifact ZIP", () => {
  it("membaca result.json dari artifact terkompresi", () => {
    const buffer = Buffer.from(DEFLATED_ZIP, "base64");
    expect(listZipEntries(buffer)).toContain("result.json");

    const file = readZipFile(buffer, "result.json");
    expect(file).not.toBeNull();

    const result = parseGradingResultJson(file!.toString("utf8"));
    expect(result.score).toBe(71);
    expect(result.passed).toBe(5);
    expect(result.total).toBe(7);
  });

  it("menemukan berkas walau berada di dalam sub-direktori", () => {
    const buffer = Buffer.from(STORED_NESTED_ZIP, "base64");
    expect(listZipEntries(buffer)).toContain("artifact/result.json");

    const file = readZipFile(buffer, "result.json");
    expect(parseGradingResultJson(file!.toString("utf8")).score).toBe(71);
  });

  it("mengembalikan null untuk berkas yang tidak ada", () => {
    expect(readZipFile(Buffer.from(DEFLATED_ZIP, "base64"), "lain.json")).toBeNull();
  });

  it("menolak berkas yang bukan ZIP", () => {
    expect(() => readZipFile(Buffer.from("bukan zip sama sekali"), "a")).toThrow(
      ZipError,
    );
  });
});

describe("verifikasi webhook GitHub", () => {
  const secret = "rahasia-webhook";
  const body = JSON.stringify({ action: "completed" });
  const signature = `sha256=${createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex")}`;

  it("menerima tanda tangan yang benar", () => {
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("menolak tanda tangan yang salah atau tidak ada", () => {
    expect(verifyWebhookSignature(body, signature, "secret-lain")).toBe(false);
    expect(verifyWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=", secret)).toBe(false);
  });

  it("membaca field penting dari event workflow_run", () => {
    const event = parseWorkflowRunEvent({
      action: "completed",
      repository: { full_name: "org/praktikum-01-dimas" },
      workflow_run: {
        id: 12345,
        run_attempt: 2,
        head_sha: "a".repeat(40),
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/org/praktikum-01-dimas/actions/runs/12345",
        updated_at: "2026-08-12T10:00:00Z",
      },
    });

    expect(event).toMatchObject({
      action: "completed",
      repositoryFullName: "org/praktikum-01-dimas",
      runId: 12345,
      runAttempt: 2,
      status: "completed",
      conclusion: "success",
    });
  });

  it("menolak payload yang tidak dikenali", () => {
    expect(parseWorkflowRunEvent(null)).toBeNull();
    expect(parseWorkflowRunEvent({})).toBeNull();
    expect(parseWorkflowRunEvent({ workflow_run: { id: 1 } })).toBeNull();
  });
});
