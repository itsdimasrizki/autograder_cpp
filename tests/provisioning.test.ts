import { describe, expect, it } from "vitest";
import {
  isValidGitHubLogin,
  parseFullName,
  studentRepoName,
} from "@/lib/github/naming";
import { safePath, withResult } from "@/lib/actions/result";

describe("penamaan repository mahasiswa", () => {
  it("mengikuti pola praktikum-NN-username", () => {
    expect(studentRepoName(1, "dimas")).toBe("praktikum-01-dimas");
    expect(studentRepoName(9, "budi")).toBe("praktikum-09-budi");
    expect(studentRepoName(12, "andi")).toBe("praktikum-12-andi");
  });

  it("stabil: pemanggilan ulang menghasilkan nama yang sama", () => {
    // Sifat inilah yang membuat penyediaan ulang aman — repo lama diadopsi,
    // bukan diduplikasi.
    expect(studentRepoName(1, "dimas")).toBe(studentRepoName(1, "dimas"));
  });

  it("menormalkan huruf besar pada username", () => {
    expect(studentRepoName(1, "Dimas")).toBe("praktikum-01-dimas");
  });

  it("menolak username GitHub yang tidak valid", () => {
    expect(() => studentRepoName(1, "spasi tidak boleh")).toThrow();
    expect(() => studentRepoName(1, "-diawali-hubung")).toThrow();
    expect(() => studentRepoName(1, "")).toThrow();
    expect(() => studentRepoName(1, "../../etc/passwd")).toThrow();
    expect(() => studentRepoName(1, "a".repeat(40))).toThrow();
  });

  it("menolak nomor pertemuan yang tidak valid", () => {
    expect(() => studentRepoName(0, "dimas")).toThrow();
    expect(() => studentRepoName(-1, "dimas")).toThrow();
    expect(() => studentRepoName(1.5, "dimas")).toThrow();
  });
});

describe("validasi username GitHub", () => {
  it("menerima username yang wajar", () => {
    for (const login of ["dimas", "budi-santoso", "a", "user123", "a1-b2-c3"]) {
      expect(isValidGitHubLogin(login)).toBe(true);
    }
  });

  it("menolak yang di luar aturan GitHub", () => {
    for (const login of [
      "",
      "-awal",
      "akhir-",
      "dua--hubung",
      "spasi ada",
      "titik.koma",
      "a".repeat(40),
    ]) {
      expect(isValidGitHubLogin(login)).toBe(false);
    }
  });
});

describe("parsing nama lengkap repository", () => {
  it("memisahkan owner dan repo", () => {
    expect(parseFullName("org/praktikum-01-dimas")).toEqual({
      owner: "org",
      repo: "praktikum-01-dimas",
    });
  });

  it("menolak bentuk yang salah", () => {
    expect(parseFullName("tanpa-slash")).toBeNull();
    expect(parseFullName("/kosong")).toBeNull();
    expect(parseFullName("kosong/")).toBeNull();
    expect(parseFullName("a/b/c")).toBeNull();
  });
});

describe("pembatasan tujuan redirect", () => {
  it("mengizinkan path internal", () => {
    expect(safePath("/dashboard", "/x")).toBe("/dashboard");
    expect(safePath("/assignments/abc?classId=1", "/x")).toBe(
      "/assignments/abc?classId=1",
    );
  });

  it("menolak tujuan di luar aplikasi", () => {
    expect(safePath("//situs-lain.example", "/dashboard")).toBe("/dashboard");
    expect(safePath("https://situs-lain.example", "/dashboard")).toBe(
      "/dashboard",
    );
    expect(safePath("/\\situs-lain.example", "/dashboard")).toBe("/dashboard");
    expect(safePath("dashboard", "/dashboard")).toBe("/dashboard");
  });

  it("menyisipkan pesan error sebagai query yang ter-encode", () => {
    expect(withResult("/admin", "Gagal & ditolak")).toBe(
      "/admin?error=Gagal%20%26%20ditolak",
    );
    expect(withResult("/admin?a=1", "x")).toBe("/admin?a=1&error=x");
    expect(withResult("/admin", null)).toBe("/admin");
  });
});
