-- =============================================================================
-- 0001_init.sql — Skema dasar Praktikum Struktur Data
-- =============================================================================
-- Jalankan di Supabase SQL Editor (atau `supabase db push`).
--
-- Catatan keamanan:
--   Seluruh akses data dilakukan server-side memakai SERVICE ROLE key.
--   RLS diaktifkan pada semua tabel TANPA policy apa pun, sehingga anon key
--   (yang boleh bocor ke browser) tidak bisa membaca/menulis apa pun.
--   Otorisasi sesungguhnya ada di src/lib/auth/authorize.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum
-- -----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('SUPER_ADMIN', 'ASSISTANT', 'STUDENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('ASSISTANT', 'STUDENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scoring_mode as enum ('BEST', 'LATEST');
exception when duplicate_object then null; end $$;

-- QUEUED/RUNNING dipakai saat workflow terdeteksi tapi hasil belum tersedia.
-- PASS/FAIL berasal dari hasil checker. ERROR = compile error / workflow gagal.
do $$ begin
  create type submission_status as enum ('QUEUED', 'RUNNING', 'PASS', 'FAIL', 'ERROR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type test_status as enum ('PASS', 'FAIL', 'SKIP');
exception when duplicate_object then null; end $$;

do $$ begin
  create type repo_status as enum ('PENDING', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- users — identitas utama adalah akun GitHub
-- -----------------------------------------------------------------------------
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  github_user_id bigint      not null unique,
  github_login   text        not null,
  display_name   text,
  avatar_url     text,
  email          text,
  role           user_role   not null default 'STUDENT',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Username GitHub bisa berubah; lookup case-insensitive saat menambah mahasiswa.
create unique index if not exists users_github_login_lower_idx
  on users (lower(github_login));

-- -----------------------------------------------------------------------------
-- courses — mis. "Praktikum Struktur Data 2026"
-- -----------------------------------------------------------------------------
create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  term        text,
  description text,
  created_by  uuid        references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- classes — Kelas A .. Kelas J di dalam sebuah course
-- -----------------------------------------------------------------------------
create table if not exists classes (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid        not null references courses (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, name),
  -- dipakai composite FK di course_members agar class selalu milik course yang sama
  unique (id, course_id)
);

create index if not exists classes_course_idx on classes (course_id);

-- -----------------------------------------------------------------------------
-- course_members — keanggotaan pada level KELAS
-- -----------------------------------------------------------------------------
-- Asisten terdaftar pada kelas tertentu saja, sehingga tidak bisa mengakses
-- kelas lain. Mahasiswa juga terdaftar pada tepat satu kelas per course.
create table if not exists course_members (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid        not null references courses (id) on delete cascade,
  class_id   uuid        not null,
  user_id    uuid        not null references users (id) on delete cascade,
  role       member_role not null,
  created_at timestamptz not null default now(),
  -- menjamin class_id benar-benar milik course_id
  foreign key (class_id, course_id) references classes (id, course_id) on delete cascade,
  unique (class_id, user_id)
);

create index if not exists course_members_user_idx   on course_members (user_id);
create index if not exists course_members_class_idx  on course_members (class_id);
create index if not exists course_members_course_idx on course_members (course_id);

-- -----------------------------------------------------------------------------
-- assignment_templates — repository template milik instruktur
-- -----------------------------------------------------------------------------
create table if not exists assignment_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  owner       text        not null,   -- org/user pemilik template
  repo        text        not null,   -- nama repo template
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner, repo)
);

-- -----------------------------------------------------------------------------
-- assignments — satu per pertemuan, milik course
-- -----------------------------------------------------------------------------
create table if not exists assignments (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid         not null references courses (id) on delete cascade,
  meeting_number int          not null check (meeting_number between 1 and 99),
  title          text         not null,
  description    text,
  template_id    uuid         references assignment_templates (id) on delete set null,
  max_score      int          not null default 100 check (max_score > 0),
  deadline       timestamptz,
  max_attempts   int          check (max_attempts is null or max_attempts > 0),
  published      boolean      not null default false,
  scoring_mode   scoring_mode not null default 'BEST',
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),
  unique (course_id, meeting_number)
);

create index if not exists assignments_course_idx on assignments (course_id);

-- -----------------------------------------------------------------------------
-- student_repositories — satu repo privat per (mahasiswa, tugas)
-- -----------------------------------------------------------------------------
create table if not exists student_repositories (
  id              uuid        primary key default gen_random_uuid(),
  assignment_id   uuid        not null references assignments (id) on delete cascade,
  user_id         uuid        not null references users (id) on delete cascade,
  github_repo_id  bigint      unique,
  owner           text        not null,
  name            text        not null,
  full_name       text        not null unique,   -- "org/praktikum-01-dimas"
  html_url        text,
  default_branch  text        not null default 'main',
  status          repo_status not null default 'PENDING',
  provision_error text,
  provisioned_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (assignment_id, user_id)
);

create index if not exists student_repositories_user_idx on student_repositories (user_id);
create index if not exists student_repositories_assignment_idx on student_repositories (assignment_id);

-- -----------------------------------------------------------------------------
-- submissions — SETIAP percobaan disimpan, tidak pernah ditimpa
-- -----------------------------------------------------------------------------
create table if not exists submissions (
  id                    uuid              primary key default gen_random_uuid(),
  assignment_id         uuid              not null references assignments (id) on delete cascade,
  user_id               uuid              not null references users (id) on delete cascade,
  student_repository_id uuid              not null references student_repositories (id) on delete cascade,
  commit_sha            text              not null,
  workflow_run_id       bigint            not null,
  run_attempt           int               not null default 1,
  status                submission_status not null default 'QUEUED',
  score                 int               check (score is null or score >= 0),
  passed_tests          int,
  total_tests           int,
  html_url              text,             -- link ke workflow run
  raw_result            jsonb,            -- hasil JSON mentah dari GitHub Actions
  submitted_at          timestamptz       not null default now(),
  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now(),
  -- KUNCI IDEMPOTENSI: event webhook ganda tidak membuat submission ganda
  unique (student_repository_id, workflow_run_id, run_attempt)
);

create index if not exists submissions_assignment_user_idx
  on submissions (assignment_id, user_id, submitted_at desc);
create index if not exists submissions_user_idx on submissions (user_id);

-- -----------------------------------------------------------------------------
-- test_results — rincian per test case dari checker
-- -----------------------------------------------------------------------------
create table if not exists test_results (
  id            uuid        primary key default gen_random_uuid(),
  submission_id uuid        not null references submissions (id) on delete cascade,
  ordinal       int         not null default 0,
  name          text        not null,
  status        test_status not null,
  points        numeric(6, 2) not null default 0,
  message       text,
  created_at    timestamptz not null default now()
);

create index if not exists test_results_submission_idx on test_results (submission_id);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'courses', 'classes', 'assignment_templates',
    'assignments', 'student_repositories', 'submissions'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on %I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security: deny-all
-- -----------------------------------------------------------------------------
-- Tidak ada policy yang dibuat => anon/authenticated key tidak dapat akses apa
-- pun. Service role (server-side saja) mem-bypass RLS.
alter table users                enable row level security;
alter table courses              enable row level security;
alter table classes              enable row level security;
alter table course_members       enable row level security;
alter table assignment_templates enable row level security;
alter table assignments          enable row level security;
alter table student_repositories enable row level security;
alter table submissions          enable row level security;
alter table test_results         enable row level security;
