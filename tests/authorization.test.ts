import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  assert,
  canAssignAssistants,
  canManageAssignment,
  canManageClassRoster,
  canManageCourse,
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
