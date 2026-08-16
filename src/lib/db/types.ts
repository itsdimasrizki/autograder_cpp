/**
 * Tipe database — ditulis manual agar sinkron dengan
 * supabase/migrations/0001_init.sql.
 *
 * Kalau skema SQL berubah, perbarui file ini juga.
 */

export type UserRole = "SUPER_ADMIN" | "ASSISTANT" | "STUDENT";
export type MemberRole = "ASSISTANT" | "STUDENT";
export type ScoringMode = "BEST" | "LATEST" | "FIRST";
export type SubmissionStatus = "QUEUED" | "RUNNING" | "PASS" | "FAIL" | "ERROR";
export type TestStatus = "PASS" | "FAIL" | "SKIP";
export type RepoStatus = "PENDING" | "READY" | "FAILED";

export type User = {
  id: string;
  github_user_id: number;
  github_login: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type Course = {
  id: string;
  name: string;
  term: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Class = {
  id: string;
  course_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type CourseMember = {
  id: string;
  course_id: string;
  class_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export type AssignmentTemplate = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  description: string | null;
  /** Soft delete: template yang diarsipkan tidak muncul di pilihan tugas baru. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Assignment = {
  id: string;
  course_id: string;
  meeting_number: number;
  title: string;
  description: string | null;
  template_id: string | null;
  max_score: number;
  deadline: string | null;
  max_attempts: number | null;
  published: boolean;
  scoring_mode: ScoringMode;
  /** Soft delete: diisi saat tugas diarsipkan karena sudah punya histori nilai. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type StudentRepository = {
  id: string;
  assignment_id: string;
  user_id: string;
  github_repo_id: number | null;
  owner: string;
  name: string;
  full_name: string;
  html_url: string | null;
  default_branch: string;
  status: RepoStatus;
  provision_error: string | null;
  provisioned_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Submission = {
  id: string;
  assignment_id: string;
  user_id: string;
  student_repository_id: string;
  commit_sha: string;
  workflow_run_id: number;
  run_attempt: number;
  status: SubmissionStatus;
  score: number | null;
  passed_tests: number | null;
  total_tests: number | null;
  html_url: string | null;
  raw_result: unknown | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Tautan undangan kelas. `token_hash` adalah SHA-256 dari token asli; token
 * aslinya hanya pernah ada di URL yang dibagikan asisten.
 */
export type ClassJoinLink = {
  id: string;
  class_id: string;
  course_id: string;
  token_hash: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

export type RoleChangeLog = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  from_role: UserRole;
  to_role: UserRole;
  created_at: string;
}

export type TestResult = {
  id: string;
  submission_id: string;
  ordinal: number;
  name: string;
  status: TestStatus;
  points: number;
  message: string | null;
  created_at: string;
}

/** Bentuk yang dipahami supabase-js untuk generic `Database`. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: Table<User>;
      courses: Table<Course>;
      classes: Table<Class>;
      course_members: Table<CourseMember>;
      assignment_templates: Table<AssignmentTemplate>;
      assignments: Table<Assignment>;
      student_repositories: Table<StudentRepository>;
      submissions: Table<Submission>;
      test_results: Table<TestResult>;
      class_join_links: Table<ClassJoinLink>;
      role_change_log: Table<RoleChangeLog>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      member_role: MemberRole;
      scoring_mode: ScoringMode;
      submission_status: SubmissionStatus;
      test_status: TestStatus;
      repo_status: RepoStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
