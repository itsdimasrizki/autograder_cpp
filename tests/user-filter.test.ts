import { describe, expect, it } from "vitest";
import {
  USER_TABS,
  parseUserTab,
  tabToRoleFilter,
} from "@/lib/user-filter";

describe("tab filter pengguna", () => {
  it("menyediakan tepat empat tab sesuai rancangan", () => {
    expect([...USER_TABS]).toEqual([
      "ALL",
      "STUDENT",
      "ASSISTANT",
      "SUPER_ADMIN",
    ]);
  });

  it("mengenali setiap tab yang sah", () => {
    for (const tab of USER_TABS) {
      expect(parseUserTab(tab)).toBe(tab);
    }
  });

  it("nilai asing dari query string jatuh ke ALL", () => {
    expect(parseUserTab("ADMIN")).toBe("ALL");
    expect(parseUserTab("student")).toBe("ALL");
    expect(parseUserTab("' or 1=1 --")).toBe("ALL");
  });

  it("query string kosong atau tidak ada jatuh ke ALL", () => {
    expect(parseUserTab("")).toBe("ALL");
    expect(parseUserTab(undefined)).toBe("ALL");
    expect(parseUserTab(null)).toBe("ALL");
  });
});

describe("penerjemahan tab ke filter database", () => {
  it("ALL tidak menyaring role apa pun", () => {
    expect(tabToRoleFilter("ALL")).toBeUndefined();
  });

  it("tab role menyaring tepat satu role", () => {
    expect(tabToRoleFilter("STUDENT")).toBe("STUDENT");
    expect(tabToRoleFilter("ASSISTANT")).toBe("ASSISTANT");
    expect(tabToRoleFilter("SUPER_ADMIN")).toBe("SUPER_ADMIN");
  });

  it("nilai yang sudah dibersihkan selalu aman dipakai sebagai filter", () => {
    // Apa pun isi query string, yang sampai ke database hanya salah satu
    // nilai enum yang sah — tidak pernah teks bebas.
    const filter = tabToRoleFilter(parseUserTab("<script>"));
    expect(filter).toBeUndefined();
  });
});
