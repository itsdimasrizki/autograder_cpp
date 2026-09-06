import { describe, expect, it } from "vitest";
import { formatWib, fromWibInput, toWibInputValue } from "@/lib/time/wib";

describe("format waktu WIB", () => {
  it("menampilkan jam WIB, bukan jam UTC", () => {
    // 13:15 UTC = 20:15 WIB pada hari yang sama.
    const hasil = formatWib("2026-09-07T13:15:00.000Z");
    expect(hasil).toMatch(/07/);
    expect(hasil).toMatch(/20[.:]15/);
    expect(hasil).toMatch(/ WIB$/);
  });

  it("menampilkan strip untuk nilai kosong atau tidak valid", () => {
    expect(formatWib(null)).toBe("—");
    expect(formatWib(undefined)).toBe("—");
    expect(formatWib("")).toBe("—");
    expect(formatWib("bukan tanggal")).toBe("—");
  });
});

describe("isian datetime-local", () => {
  it("mengubah instant UTC menjadi jam dinding WIB", () => {
    expect(toWibInputValue("2026-09-07T13:15:00.000Z")).toBe("2026-09-07T20:15");
  });

  it("melewati tengah malam WIB dengan benar", () => {
    // 17:00 UTC tanggal 7 sudah menjadi 00:00 WIB tanggal 8.
    expect(toWibInputValue("2026-09-07T17:00:00.000Z")).toBe("2026-09-08T00:00");
  });

  it("mengembalikan string kosong untuk nilai kosong", () => {
    expect(toWibInputValue(null)).toBe("");
    expect(toWibInputValue("bukan tanggal")).toBe("");
  });
});

describe("membaca isian sebagai WIB", () => {
  it("menafsirkan isian sebagai WIB lalu menyimpannya sebagai UTC", () => {
    expect(fromWibInput("2026-09-07T20:15")).toBe("2026-09-07T13:15:00.000Z");
  });

  it("melewati tengah malam WIB dengan benar", () => {
    expect(fromWibInput("2026-09-08T00:00")).toBe("2026-09-07T17:00:00.000Z");
  });

  it("bolak-balik tanpa kehilangan nilai", () => {
    const asal = "2026-12-31T17:30:00.000Z";
    expect(fromWibInput(toWibInputValue(asal))).toBe(asal);
  });

  it("isian kosong berarti tanpa tenggat", () => {
    expect(fromWibInput("")).toBeNull();
    expect(fromWibInput("   ")).toBeNull();
  });

  it("menolak isian yang bukan tanggal", () => {
    expect(() => fromWibInput("besok sore")).toThrow("Tenggat tidak valid.");
  });

  it("menolak tanggal yang tidak ada, bukan menggesernya diam-diam", () => {
    // Date.UTC menggulung 31 Februari menjadi 3 Maret; itu harus ditolak.
    expect(() => fromWibInput("2026-02-31T10:00")).toThrow("Tenggat tidak valid.");
    expect(() => fromWibInput("2026-13-01T10:00")).toThrow("Tenggat tidak valid.");
    expect(() => fromWibInput("2026-09-07T25:00")).toThrow("Tenggat tidak valid.");
  });
});
