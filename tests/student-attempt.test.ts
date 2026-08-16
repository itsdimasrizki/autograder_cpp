import { describe, expect, it } from "vitest";
import { isStudentAttempt, type RunInfo } from "@/lib/grading/ingest";
import { parseWorkflowRunEvent } from "@/lib/github/webhook";

/**
 * Nilai-nilai di berkas ini bukan karangan: semuanya disalin dari respons
 * GitHub yang sebenarnya untuk repo praktikum-01-wortellemez, yang punya satu
 * run provisioning dan satu run dari push praktikan.
 */
const BOT_LOGIN = "praktikum-struktur-data-upnvyk[bot]";
const STUDENT_LOGIN = "itsdimasrizki";

function makeRun(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    runId: 31807130781,
    runAttempt: 1,
    headSha: "45d7588a".padEnd(40, "0"),
    status: "completed",
    conclusion: "success",
    htmlUrl: null,
    updatedAt: "2026-08-14T13:57:13Z",
    event: "push",
    triggeringActor: STUDENT_LOGIN,
    actorType: "User",
    ...overrides,
  };
}

describe("percobaan milik praktikan", () => {
  it("commit provisioning dari GitHub App bukan percobaan", () => {
    const run = makeRun({ triggeringActor: BOT_LOGIN, actorType: "Bot" });
    expect(isStudentAttempt(run)).toBe(false);
  });

  it("push praktikan adalah percobaan", () => {
    expect(isStudentAttempt(makeRun())).toBe(true);
  });

  it("push asisten juga dihitung sebagai percobaan", () => {
    // Aturannya "semua kecuali bot": perbaikan yang didorong asisten ke repo
    // praktikan tetap dinilai, bukan diabaikan diam-diam.
    const run = makeRun({ triggeringActor: "asisten-kelas", actorType: "User" });
    expect(isStudentAttempt(run)).toBe(true);
  });

  it("akhiran [bot] cukup, walau tipe actor tidak terbaca", () => {
    const run = makeRun({ triggeringActor: BOT_LOGIN, actorType: null });
    expect(isStudentAttempt(run)).toBe(false);
  });

  it("tipe Bot cukup, walau login tidak berakhiran [bot]", () => {
    const run = makeRun({ triggeringActor: "dependabot", actorType: "Bot" });
    expect(isStudentAttempt(run)).toBe(false);
  });

  it("run tanpa keterangan actor tetap dicatat", () => {
    // Gagal ke arah aman: lebih baik mencatat percobaan yang meragukan
    // daripada membuang pengumpulan praktikan tanpa jejak.
    const run = makeRun({ triggeringActor: null, actorType: null });
    expect(isStudentAttempt(run)).toBe(true);
  });

  it("workflow_dispatch bukan percobaan walau dipicu praktikan sendiri", () => {
    // Menekan "Run workflow" di tab Actions tidak mengubah kode apa pun.
    // Tanpa syarat ini, praktikan bisa mengunci nilainya di 0 pada mode FIRST
    // hanya dengan menjalankan workflow pada stub yang belum disentuh.
    const run = makeRun({ event: "workflow_dispatch" });
    expect(isStudentAttempt(run)).toBe(false);
  });

  it("pull_request bukan percobaan terpisah", () => {
    // Push ke branch-nya sudah menghasilkan run tersendiri; menghitung run
    // pull_request lagi berarti satu perubahan dihitung dua kali.
    const run = makeRun({ event: "pull_request" });
    expect(isStudentAttempt(run)).toBe(false);
  });

  it("run tanpa keterangan event tetap dicatat", () => {
    const run = makeRun({ event: null });
    expect(isStudentAttempt(run)).toBe(true);
  });
});

describe("pembacaan actor dari payload webhook", () => {
  const basePayload = {
    action: "completed",
    repository: { full_name: "praktikum-struktur-data-upnvyk/praktikum-01-wortellemez" },
    workflow_run: {
      id: 31806977452,
      run_attempt: 1,
      head_sha: "4505b2b3".padEnd(40, "0"),
      status: "completed",
      conclusion: "failure",
      html_url: null,
      updated_at: "2026-08-14T13:55:18Z",
      event: "push",
    },
  };

  it("membaca triggering_actor beserta tipenya", () => {
    const event = parseWorkflowRunEvent({
      ...basePayload,
      workflow_run: {
        ...basePayload.workflow_run,
        actor: { login: BOT_LOGIN, type: "Bot" },
        triggering_actor: { login: BOT_LOGIN, type: "Bot" },
      },
    });

    expect(event?.triggeringActor).toBe(BOT_LOGIN);
    expect(event?.actorType).toBe("Bot");
  });

  it("jatuh ke actor bila triggering_actor tidak ada", () => {
    const event = parseWorkflowRunEvent({
      ...basePayload,
      workflow_run: {
        ...basePayload.workflow_run,
        actor: { login: STUDENT_LOGIN, type: "User" },
      },
    });

    expect(event?.triggeringActor).toBe(STUDENT_LOGIN);
    expect(event?.actorType).toBe("User");
  });

  it("payload tanpa actor sama sekali tetap terbaca", () => {
    const event = parseWorkflowRunEvent(basePayload);

    expect(event).not.toBeNull();
    expect(event?.triggeringActor).toBeNull();
    expect(event?.actorType).toBeNull();
  });

  it("membaca event pemicu run", () => {
    expect(parseWorkflowRunEvent(basePayload)?.event).toBe("push");

    const dispatch = parseWorkflowRunEvent({
      ...basePayload,
      workflow_run: { ...basePayload.workflow_run, event: "workflow_dispatch" },
    });
    expect(dispatch?.event).toBe("workflow_dispatch");
  });
});
