import { describe, expect, it } from "vitest";
import {
  canDeleteTemplate,
  decideAssignmentDeletion,
  describeTemplateDependents,
} from "@/lib/lifecycle";

describe("penghapusan tugas", () => {
  it("tugas tanpa jejak apa pun dihapus permanen", () => {
    expect(
      decideAssignmentDeletion({ submissions: 0, repositories: 0 }),
    ).toBe("HAPUS_PERMANEN");
  });

  it("tugas yang sudah punya submission hanya diarsipkan", () => {
    expect(
      decideAssignmentDeletion({ submissions: 1, repositories: 0 }),
    ).toBe("ARSIPKAN");
  });

  it("tugas yang sudah punya repository mahasiswa hanya diarsipkan", () => {
    // Repository GitHub sudah terlanjur dibuat; menghapus baris tugas akan
    // memutus hubungannya tanpa jejak.
    expect(
      decideAssignmentDeletion({ submissions: 0, repositories: 1 }),
    ).toBe("ARSIPKAN");
  });

  it("riwayat nilai yang banyak tetap membuat tugas diarsipkan", () => {
    expect(
      decideAssignmentDeletion({ submissions: 250, repositories: 40 }),
    ).toBe("ARSIPKAN");
  });
});

describe("penghapusan template", () => {
  const tugas = { meeting_number: 3, title: "Linked List Tunggal" };

  it("template tanpa pemakai boleh dihapus", () => {
    expect(canDeleteTemplate([])).toBe(true);
  });

  it("template yang masih dipakai tugas aktif tidak boleh dihapus", () => {
    expect(canDeleteTemplate([tugas])).toBe(false);
  });

  it("alasan penolakan menyebut tugas mana yang memakainya", () => {
    const pesan = describeTemplateDependents([tugas]);
    expect(pesan).toContain("Pertemuan 3");
    expect(pesan).toContain("Linked List Tunggal");
  });

  it("alasan penolakan menyebut seluruh tugas pemakai", () => {
    const pesan = describeTemplateDependents([
      tugas,
      { meeting_number: 5, title: "Stack" },
    ]);
    expect(pesan).toContain("2 tugas aktif");
    expect(pesan).toContain("Pertemuan 5");
  });
});
