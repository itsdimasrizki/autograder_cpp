import { describe, expect, it } from "vitest";
import {
  createOAuthState,
  createSessionToken,
  verifyOAuthState,
  verifySessionToken,
} from "@/lib/auth/session";
import {
  buildAuthorizeUrl,
  normalizeProfile,
  pickPrimaryEmail,
} from "@/lib/auth/github-oauth";

const SECRET = "a".repeat(32);
const OTHER_SECRET = "b".repeat(32);

describe("token sesi", () => {
  it("bolak-balik untuk token yang valid", () => {
    const token = createSessionToken("user-1", SECRET);
    expect(verifySessionToken(token, SECRET)?.uid).toBe("user-1");
  });

  it("menolak token yang ditandatangani dengan secret lain", () => {
    const token = createSessionToken("user-1", OTHER_SECRET);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("menolak payload yang dirusak (browser tidak bisa mengganti user id)", () => {
    const token = createSessionToken("user-1", SECRET);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({
        uid: "user-admin",
        iat: 0,
        exp: Math.floor(Date.now() / 1000) + 1000,
      }),
    ).toString("base64url");

    expect(verifySessionToken(`${forgedBody}.${signature}`, SECRET)).toBeNull();
  });

  it("menolak token kedaluwarsa", () => {
    const now = 1_000_000;
    const token = createSessionToken("user-1", SECRET, now, 60);
    expect(verifySessionToken(token, SECRET, now + 30)?.uid).toBe("user-1");
    expect(verifySessionToken(token, SECRET, now + 61)).toBeNull();
  });

  it("menolak input rusak tanpa melempar error", () => {
    for (const bad of ["", "abc", "a.b.c", ".", "x.", ".y", null, undefined]) {
      expect(verifySessionToken(bad as string, SECRET)).toBeNull();
    }
  });

  it("tidak pernah menyimpan role di dalam token", () => {
    const token = createSessionToken("user-1", SECRET);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
    );
    expect(payload).not.toHaveProperty("role");
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "uid"]);
  });
});

describe("state OAuth", () => {
  it("cocok hanya bila query dan cookie identik", () => {
    const state = createOAuthState();
    expect(verifyOAuthState(state, state)).toBe(true);
    expect(verifyOAuthState(state, createOAuthState())).toBe(false);
    expect(verifyOAuthState(state, undefined)).toBe(false);
    expect(verifyOAuthState(null, state)).toBe(false);
    expect(verifyOAuthState(state, state.slice(0, -1))).toBe(false);
  });

  it("menghasilkan state yang tidak dapat ditebak", () => {
    const states = new Set(Array.from({ length: 50 }, createOAuthState));
    expect(states.size).toBe(50);
  });
});

describe("alur login GitHub", () => {
  it("membangun URL otorisasi dengan scope minimal dan state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-123",
        redirectUri: "https://app.test/api/auth/github/callback",
        state: "state-abc",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    // Tidak boleh meminta scope repo untuk sekadar login.
    expect(url.searchParams.get("scope")).not.toContain("repo");
  });

  it("menormalkan profil GitHub", () => {
    const profile = normalizeProfile({
      id: 4242,
      login: "dimas",
      name: "Dimas Rizki",
      avatar_url: "https://avatars.githubusercontent.com/u/4242",
      email: null,
    });

    expect(profile).toEqual({
      githubUserId: 4242,
      githubLogin: "dimas",
      displayName: "Dimas Rizki",
      avatarUrl: "https://avatars.githubusercontent.com/u/4242",
      email: null,
    });
  });

  it("memakai email cadangan bila profil menyembunyikan email", () => {
    const profile = normalizeProfile(
      { id: 1, login: "budi", name: null, avatar_url: null, email: null },
      "budi@kampus.ac.id",
    );
    expect(profile.email).toBe("budi@kampus.ac.id");
  });

  it("menolak respons profil yang tidak valid", () => {
    expect(() => normalizeProfile({ login: "tanpa-id" })).toThrow();
    expect(() => normalizeProfile({ id: 1 })).toThrow();
  });

  it("memilih email utama yang terverifikasi", () => {
    expect(
      pickPrimaryEmail([
        { email: "kedua@x.com", primary: false, verified: true },
        { email: "utama@x.com", primary: true, verified: true },
      ]),
    ).toBe("utama@x.com");

    // Email utama yang belum terverifikasi tidak dipakai.
    expect(
      pickPrimaryEmail([
        { email: "belum@x.com", primary: true, verified: false },
        { email: "sudah@x.com", primary: false, verified: true },
      ]),
    ).toBe("sudah@x.com");

    expect(pickPrimaryEmail([])).toBeNull();
  });
});
