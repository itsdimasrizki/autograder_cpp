import { describe, expect, it } from "vitest";
import {
  buildJoinUrl,
  generateJoinToken,
  hashJoinToken,
  isJoinLinkUsable,
  isWellFormedJoinToken,
  joinLinkStatus,
  joinTokenMatches,
} from "@/lib/auth/join-token";

const AKTIF = { revoked_at: null, expires_at: null };

describe("pembuatan token undangan", () => {
  it("menghasilkan token acak yang berbeda setiap kali", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateJoinToken()),
    );
    expect(tokens.size).toBe(200);
  });

  it("token yang dihasilkan selalu berbentuk sah", () => {
    for (let i = 0; i < 50; i++) {
      expect(isWellFormedJoinToken(generateJoinToken())).toBe(true);
    }
  });

  it("token cukup panjang untuk tidak dapat ditebak", () => {
    // 43 karakter base64url = 32 byte entropi.
    expect(generateJoinToken()).toHaveLength(43);
  });
});

describe("bentuk token", () => {
  it("menolak UUID kelas sebagai token", () => {
    // Inti keamanannya: UUID kelas TIDAK boleh berlaku sebagai undangan.
    expect(
      isWellFormedJoinToken("6b2e3c9b-18e6-474b-8eb4-a1a80d230660"),
    ).toBe(false);
  });

  it("menolak nilai kosong, null, dan undefined", () => {
    expect(isWellFormedJoinToken("")).toBe(false);
    expect(isWellFormedJoinToken(null)).toBe(false);
    expect(isWellFormedJoinToken(undefined)).toBe(false);
  });

  it("menolak token yang panjangnya salah", () => {
    expect(isWellFormedJoinToken("a".repeat(42))).toBe(false);
    expect(isWellFormedJoinToken("a".repeat(44))).toBe(false);
  });

  it("menolak karakter di luar base64url", () => {
    expect(isWellFormedJoinToken(`${"a".repeat(42)}/`)).toBe(false);
    expect(isWellFormedJoinToken(`${"a".repeat(42)}+`)).toBe(false);
  });
});

describe("hash token", () => {
  it("hash bersifat tetap untuk token yang sama", () => {
    const token = generateJoinToken();
    expect(hashJoinToken(token)).toBe(hashJoinToken(token));
  });

  it("token berbeda menghasilkan hash berbeda", () => {
    expect(hashJoinToken(generateJoinToken())).not.toBe(
      hashJoinToken(generateJoinToken()),
    );
  });

  it("hash tidak memuat token aslinya", () => {
    const token = generateJoinToken();
    expect(hashJoinToken(token)).not.toContain(token);
  });

  it("cocok hanya untuk token yang benar", () => {
    const token = generateJoinToken();
    const lain = generateJoinToken();
    expect(joinTokenMatches(token, hashJoinToken(token))).toBe(true);
    expect(joinTokenMatches(lain, hashJoinToken(token))).toBe(false);
  });

  it("token yang dimanipulasi satu karakter tidak cocok", () => {
    const token = generateJoinToken();
    const diubah = `x${token.slice(1)}`;
    expect(joinTokenMatches(diubah, hashJoinToken(token))).toBe(
      diubah === token,
    );
  });
});

describe("masa berlaku tautan", () => {
  it("tautan tanpa kedaluwarsa dan belum dicabut berstatus aktif", () => {
    expect(joinLinkStatus(AKTIF)).toBe("AKTIF");
    expect(isJoinLinkUsable(AKTIF)).toBe(true);
  });

  it("tautan yang dicabut tidak dapat dipakai", () => {
    const dicabut = {
      revoked_at: "2026-08-01T00:00:00Z",
      expires_at: null,
    };
    expect(joinLinkStatus(dicabut)).toBe("DICABUT");
    expect(isJoinLinkUsable(dicabut)).toBe(false);
  });

  it("pencabutan menang atas masa berlaku yang masih panjang", () => {
    const dicabut = {
      revoked_at: "2026-08-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
    };
    expect(isJoinLinkUsable(dicabut)).toBe(false);
  });

  it("tautan kedaluwarsa tidak dapat dipakai", () => {
    const link = { revoked_at: null, expires_at: "2026-08-01T00:00:00Z" };
    expect(joinLinkStatus(link, new Date("2026-08-02T00:00:00Z"))).toBe(
      "KEDALUWARSA",
    );
    expect(isJoinLinkUsable(link, new Date("2026-08-02T00:00:00Z"))).toBe(false);
  });

  it("tautan masih berlaku sebelum waktu kedaluwarsa", () => {
    const link = { revoked_at: null, expires_at: "2026-08-10T00:00:00Z" };
    expect(isJoinLinkUsable(link, new Date("2026-08-09T23:59:00Z"))).toBe(true);
  });

  it("tepat pada detik kedaluwarsa sudah tidak berlaku", () => {
    const link = { revoked_at: null, expires_at: "2026-08-10T00:00:00Z" };
    expect(isJoinLinkUsable(link, new Date("2026-08-10T00:00:00Z"))).toBe(false);
  });
});

describe("pembentukan URL undangan", () => {
  it("menyusun URL dari APP_URL dan token", () => {
    expect(buildJoinUrl("https://contoh.test", "abc")).toBe(
      "https://contoh.test/join/abc",
    );
  });

  it("garis miring di akhir APP_URL tidak menggandakan pemisah", () => {
    expect(buildJoinUrl("https://contoh.test/", "abc")).toBe(
      "https://contoh.test/join/abc",
    );
  });
});
