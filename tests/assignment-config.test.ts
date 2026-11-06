import { describe, expect, it } from "vitest";
import {
  pickStudentClassId,
  resolveAssignmentConfig,
  type AssignmentDefaults,
} from "@/lib/grading/config";
import type { AssignmentClassSettings } from "@/lib/db/types";

const dasar: AssignmentDefaults = {
  deadline: "2026-09-07T13:00:00.000Z",
  max_attempts: 3,
  scoring_mode: "BEST",
};

function override(
  patch: Partial<AssignmentClassSettings> = {},
): AssignmentClassSettings {
  return {
    assignment_id: "assignment-1",
    class_id: "class-a",
    course_id: "course-1",
    deadline: "2026-09-08T13:00:00.000Z",
    max_attempts: 1,
    scoring_mode: "FIRST",
    updated_by: "user-asisten",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

describe("resolusi konfigurasi tugas", () => {
  it("memakai nilai dasar bila kelas belum pernah disetel", () => {
    expect(resolveAssignmentConfig(dasar, null)).toEqual({
      deadline: "2026-09-07T13:00:00.000Z",
      maxAttempts: 3,
      scoringMode: "BEST",
      source: "DASAR",
    });
  });

  it("memperlakukan undefined sama dengan belum disetel", () => {
    expect(resolveAssignmentConfig(dasar, undefined).source).toBe("DASAR");
  });

  it("memakai setelan kelas bila barisnya ada", () => {
    expect(resolveAssignmentConfig(dasar, override())).toEqual({
      deadline: "2026-09-08T13:00:00.000Z",
      maxAttempts: 1,
      scoringMode: "FIRST",
      source: "KELAS",
    });
  });

  it("null pada setelan kelas berarti tanpa tenggat, bukan ikut nilai dasar", () => {
    // Inilah alasan resolusinya seluruh-baris, bukan per-field: asisten yang
    // sengaja mengosongkan tenggat kelasnya tidak boleh diam-diam ditarik
    // kembali ke tenggat dasar.
    const hasil = resolveAssignmentConfig(
      dasar,
      override({ deadline: null, max_attempts: null }),
    );
    expect(hasil.deadline).toBeNull();
    expect(hasil.maxAttempts).toBeNull();
    expect(hasil.source).toBe("KELAS");
  });
});

describe("kelas yang berlaku untuk seorang mahasiswa", () => {
  const anggota = (
    classId: string,
    createdAt: string,
    courseId = "course-1",
  ) => ({ course_id: courseId, class_id: classId, created_at: createdAt });

  it("mengembalikan kelas pada course yang diminta", () => {
    const daftar = [
      anggota("class-a", "2026-08-01T00:00:00.000Z"),
      anggota("class-z", "2026-08-01T00:00:00.000Z", "course-lain"),
    ];
    expect(pickStudentClassId(daftar, "course-1")).toBe("class-a");
  });

  it("memilih keanggotaan paling awal bila mahasiswa ada di dua kelas", () => {
    // unique (class_id, user_id) tidak melarang keadaan ini, jadi pilihannya
    // harus dipatok agar nilai yang tampil tidak bergantung pada urutan baris
    // yang dikembalikan database.
    const daftar = [
      anggota("class-b", "2026-08-05T00:00:00.000Z"),
      anggota("class-a", "2026-08-01T00:00:00.000Z"),
    ];
    expect(pickStudentClassId(daftar, "course-1")).toBe("class-a");
  });

  it("memakai class_id terkecil bila waktu bergabungnya sama persis", () => {
    const daftar = [
      anggota("class-c", "2026-08-01T00:00:00.000Z"),
      anggota("class-b", "2026-08-01T00:00:00.000Z"),
    ];
    expect(pickStudentClassId(daftar, "course-1")).toBe("class-b");
  });

  it("mengembalikan null bila mahasiswa tidak terdaftar di course itu", () => {
    expect(pickStudentClassId([], "course-1")).toBeNull();
    expect(
      pickStudentClassId([anggota("class-a", "2026-08-01T00:00:00.000Z")], "course-lain"),
    ).toBeNull();
  });

  it("tidak mengubah urutan array yang diterimanya", () => {
    const daftar = [
      anggota("class-b", "2026-08-05T00:00:00.000Z"),
      anggota("class-a", "2026-08-01T00:00:00.000Z"),
    ];
    pickStudentClassId(daftar, "course-1");
    expect(daftar.map((m) => m.class_id)).toEqual(["class-b", "class-a"]);
  });
});
