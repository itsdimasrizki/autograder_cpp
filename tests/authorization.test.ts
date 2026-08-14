import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  assert,
  canAssignAssistants,
  canChangeRole,
  canListAllUsers,
  canManageAssignment,
  canManageClassRoster,
  canManageCourse,
  canManageJoinLink,
  canProvisionRepository,
  canViewAssignment,
  canViewClass,
  canViewCourse,
  canViewStudentData,
  managedClassIds,
  type AccessContext,
  type Membership,
} from "@/lib/auth/policy";

// -----------------------------------------------------------------------------
// Dua kelas dalam satu mata kuliah, ditambah satu mata kuliah lain.
// -----------------------------------------------------------------------------
const COURSE = "course-strukdat";
const OTHER_COURSE = "course-lain";
const CLASS_A = "class-a";
const CLASS_B = "class-b";

const membership = (
  classId: string,
  role: Membership["role"],
  courseId = COURSE,
): Membership => ({ course_id: courseId, class_id: classId, role });

const admin: AccessContext = {
  user: { id: "user-admin", role: "SUPER_ADMIN" },
  memberships: [],
};

/** Asisten Kelas A. */
const assistantA: AccessContext = {
  user: { id: "user-asisten-a", role: "ASSISTANT" },
  memberships: [membership(CLASS_A, "ASSISTANT")],
};

/** Asisten Kelas B. */
const assistantB: AccessContext = {
  user: { id: "user-asisten-b", role: "ASSISTANT" },
  memberships: [membership(CLASS_B, "ASSISTANT")],
};

/** Asisten yang belum ditugaskan ke kelas mana pun. */
const assistantTanpaKelas: AccessContext = {
  user: { id: "user-asisten-c", role: "ASSISTANT" },
  memberships: [],
};

/** Mahasiswa Kelas A. */
const studentA: AccessContext = {
  user: { id: "user-dimas", role: "STUDENT" },
  memberships: [membership(CLASS_A, "STUDENT")],
};

/** Mahasiswa Kelas B. */
const studentB: AccessContext = {
  user: { id: "user-budi", role: "STUDENT" },
  memberships: [membership(CLASS_B, "STUDENT")],
};

const outsider: AccessContext = {
  user: { id: "user-luar", role: "STUDENT" },
  memberships: [],
};

const publishedAssignment = {
  id: "assignment-1",
  course_id: COURSE,
  published: true,
};
const draftAssignment = {
  id: "assignment-2",
  course_id: COURSE,
  published: false,
};

describe("isolasi mahasiswa", () => {
  it("Mahasiswa A tidak dapat membaca data Mahasiswa B", () => {
    expect(
      canViewStudentData(studentA, studentB.user.id, studentB.memberships),
    ).toBe(false);
  });

  it("Mahasiswa B tidak dapat membaca data Mahasiswa A", () => {
    expect(
      canViewStudentData(studentB, studentA.user.id, studentA.memberships),
    ).toBe(false);
  });

  it("mahasiswa sekelas pun tidak boleh saling melihat", () => {
    const teman: AccessContext = {
      user: { id: "user-teman", role: "STUDENT" },
      memberships: [membership(CLASS_A, "STUDENT")],
    };
    expect(canViewStudentData(studentA, teman.user.id, teman.memberships)).toBe(
      false,
    );
  });

  it("mahasiswa selalu dapat membaca datanya sendiri", () => {
    expect(
      canViewStudentData(studentA, studentA.user.id, studentA.memberships),
    ).toBe(true);
  });

  it("mahasiswa tidak dapat menyediakan repository untuk orang lain", () => {
    expect(canProvisionRepository(studentA, studentB.memberships)).toBe(false);
  });
});

describe("isolasi asisten", () => {
  it("Asisten Kelas A tidak dapat mengakses Kelas B", () => {
    expect(canViewClass(assistantA, CLASS_B)).toBe(false);
    expect(canManageClassRoster(assistantA, CLASS_B)).toBe(false);
  });

  it("Asisten Kelas A dapat mengakses Kelas A", () => {
    expect(canViewClass(assistantA, CLASS_A)).toBe(true);
    expect(canManageClassRoster(assistantA, CLASS_A)).toBe(true);
  });

  it("Asisten Kelas A tidak dapat membaca mahasiswa Kelas B", () => {
    expect(
      canViewStudentData(assistantA, studentB.user.id, studentB.memberships),
    ).toBe(false);
  });

  it("Asisten Kelas A dapat membaca mahasiswa Kelas A", () => {
    expect(
      canViewStudentData(assistantA, studentA.user.id, studentA.memberships),
    ).toBe(true);
  });

  it("Asisten Kelas B tidak dapat menyediakan repository mahasiswa Kelas A", () => {
    expect(canProvisionRepository(assistantB, studentA.memberships)).toBe(false);
  });

  it("role ASSISTANT tanpa penugasan kelas tidak memberi akses apa pun", () => {
    expect(canViewClass(assistantTanpaKelas, CLASS_A)).toBe(false);
    expect(canViewCourse(assistantTanpaKelas, COURSE)).toBe(false);
    expect(
      canViewStudentData(
        assistantTanpaKelas,
        studentA.user.id,
        studentA.memberships,
      ),
    ).toBe(false);
    expect(managedClassIds(assistantTanpaKelas)).toEqual([]);
  });

  it("asisten tidak dapat membuat mata kuliah, tugas, atau menugaskan asisten", () => {
    expect(canManageCourse(assistantA)).toBe(false);
    expect(canManageAssignment(assistantA)).toBe(false);
    expect(canAssignAssistants(assistantA)).toBe(false);
  });
});

describe("akses admin", () => {
  it("SUPER_ADMIN dapat mengakses semua kelas dan mahasiswa", () => {
    expect(canViewClass(admin, CLASS_A)).toBe(true);
    expect(canViewClass(admin, CLASS_B)).toBe(true);
    expect(canViewCourse(admin, OTHER_COURSE)).toBe(true);
    expect(
      canViewStudentData(admin, studentB.user.id, studentB.memberships),
    ).toBe(true);
    expect(canManageCourse(admin)).toBe(true);
    expect(canManageAssignment(admin)).toBe(true);
    expect(canAssignAssistants(admin)).toBe(true);
  });
});

describe("keterlihatan tugas", () => {
  it("mahasiswa hanya melihat tugas yang sudah diterbitkan", () => {
    expect(canViewAssignment(studentA, publishedAssignment)).toBe(true);
    expect(canViewAssignment(studentA, draftAssignment)).toBe(false);
  });

  it("asisten pada mata kuliah tersebut melihat draf", () => {
    expect(canViewAssignment(assistantA, draftAssignment)).toBe(true);
  });

  it("admin melihat semua tugas", () => {
    expect(canViewAssignment(admin, draftAssignment)).toBe(true);
  });

  it("pengguna di luar mata kuliah tidak melihat tugas apa pun", () => {
    expect(canViewAssignment(outsider, publishedAssignment)).toBe(false);
    expect(canViewAssignment(outsider, draftAssignment)).toBe(false);
  });

  it("mahasiswa mata kuliah lain tidak melihat tugas mata kuliah ini", () => {
    const lain: AccessContext = {
      user: { id: "user-lain", role: "STUDENT" },
      memberships: [membership("class-x", "STUDENT", OTHER_COURSE)],
    };
    expect(canViewAssignment(lain, publishedAssignment)).toBe(false);
  });
});

describe("tautan undangan kelas", () => {
  it("admin dapat membuat tautan untuk kelas mana pun", () => {
    expect(canManageJoinLink(admin, CLASS_A)).toBe(true);
    expect(canManageJoinLink(admin, CLASS_B)).toBe(true);
  });

  it("asisten hanya dapat membuat tautan untuk kelas yang ditugaskan", () => {
    expect(canManageJoinLink(assistantA, CLASS_A)).toBe(true);
    expect(canManageJoinLink(assistantA, CLASS_B)).toBe(false);
  });

  it("mahasiswa tidak pernah dapat membuat tautan undangan", () => {
    expect(canManageJoinLink(studentA, CLASS_A)).toBe(false);
    expect(canManageJoinLink(studentA, CLASS_B)).toBe(false);
  });

  it("asisten tanpa penugasan kelas tidak dapat membuat tautan", () => {
    expect(canManageJoinLink(assistantTanpaKelas, CLASS_A)).toBe(false);
  });
});

describe("daftar seluruh pengguna", () => {
  it("hanya admin yang boleh melihat daftar seluruh pengguna", () => {
    expect(canListAllUsers(admin)).toBe(true);
    expect(canListAllUsers(assistantA)).toBe(false);
    expect(canListAllUsers(studentA)).toBe(false);
  });
});

describe("perubahan role", () => {
  const mahasiswa = { id: "user-dimas", role: "STUDENT" as const };
  const asisten = { id: "user-asisten-a", role: "ASSISTANT" as const };
  const superAdminLain = { id: "user-admin-2", role: "SUPER_ADMIN" as const };

  it("admin dapat mempromosikan mahasiswa menjadi asisten", () => {
    expect(canChangeRole(admin, mahasiswa, "ASSISTANT")).toBe(true);
  });

  it("admin dapat menurunkan asisten menjadi mahasiswa", () => {
    expect(canChangeRole(admin, asisten, "STUDENT")).toBe(true);
  });

  it("mahasiswa tidak dapat mengubah role dirinya sendiri", () => {
    expect(canChangeRole(studentA, mahasiswa, "ASSISTANT")).toBe(false);
    expect(canChangeRole(studentA, mahasiswa, "SUPER_ADMIN")).toBe(false);
  });

  it("asisten tidak dapat mengangkat dirinya menjadi SUPER_ADMIN", () => {
    expect(canChangeRole(assistantA, asisten, "SUPER_ADMIN")).toBe(false);
  });

  it("asisten tidak dapat mengubah role orang lain", () => {
    expect(canChangeRole(assistantA, mahasiswa, "ASSISTANT")).toBe(false);
  });

  it("admin tidak dapat mengubah role dirinya sendiri", () => {
    expect(
      canChangeRole(admin, { id: admin.user.id, role: "SUPER_ADMIN" }, "STUDENT"),
    ).toBe(false);
  });

  it("role SUPER_ADMIN milik orang lain tidak dapat diturunkan lewat UI", () => {
    expect(canChangeRole(admin, superAdminLain, "STUDENT")).toBe(false);
    expect(canChangeRole(admin, superAdminLain, "ASSISTANT")).toBe(false);
  });

  it("tidak ada jalan mengangkat siapa pun menjadi SUPER_ADMIN lewat UI", () => {
    expect(canChangeRole(admin, mahasiswa, "SUPER_ADMIN")).toBe(false);
    expect(canChangeRole(admin, asisten, "SUPER_ADMIN")).toBe(false);
  });

  it("mengubah role menjadi role yang sama ditolak", () => {
    expect(canChangeRole(admin, mahasiswa, "STUDENT")).toBe(false);
    expect(canChangeRole(admin, asisten, "ASSISTANT")).toBe(false);
  });
});

describe("akses tanpa hak", () => {
  it("mahasiswa tidak dapat mengelola mata kuliah atau kelas", () => {
    expect(canManageCourse(studentA)).toBe(false);
    expect(canManageAssignment(studentA)).toBe(false);
    expect(canManageClassRoster(studentA, CLASS_A)).toBe(false);
    expect(canAssignAssistants(studentA)).toBe(false);
  });

  it("pengguna tanpa keanggotaan tidak melihat mata kuliah", () => {
    expect(canViewCourse(outsider, COURSE)).toBe(false);
    expect(canViewClass(outsider, CLASS_A)).toBe(false);
  });

  it("assert melempar AuthorizationError saat ditolak", () => {
    expect(() => assert(canManageCourse(studentA))).toThrow(AuthorizationError);
    expect(() => assert(canManageCourse(admin))).not.toThrow();
  });
});
