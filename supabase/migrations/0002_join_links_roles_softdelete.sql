-- =============================================================================
-- 0002_join_links_roles_softdelete.sql
-- =============================================================================
-- Menambah:
--   1. Perbaikan identitas user (root cause login non-admin gagal).
--   2. class_join_links  — bergabung ke kelas lewat tautan.
--   3. assignments.archived_at / assignment_templates.archived_at — soft delete.
--   4. role_change_log   — audit perubahan role.
--
-- Aman dijalankan berulang. TIDAK menghapus data apa pun.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Identitas user: github_user_id adalah SATU-SATUNYA kunci identitas
-- -----------------------------------------------------------------------------
-- ROOT CAUSE login non-admin:
--   users_github_login_lower_idx bersifat UNIQUE. Saat asisten menambahkan
--   mahasiswa manual, baris dibuat dengan github_login tertentu. Bila kemudian
--   ada akun GitHub lain login dengan username yang sama (karena pemilik lama
--   mengganti username lalu username itu dipakai orang lain, atau asisten salah
--   ketik username milik orang lain), INSERT saat login gagal dengan
--   23505 duplicate key -> callback menangkapnya -> "login_gagal".
--
-- Username GitHub BUKAN identitas stabil dan tidak boleh unique.
-- github_user_id (bigint, sudah unique) tetap menjadi identitas utama.
drop index if exists users_github_login_lower_idx;

-- Index non-unique: pencarian case-insensitive tetap cepat saat asisten
-- menambahkan mahasiswa lewat username.
create index if not exists users_github_login_lower_idx
  on users (lower(github_login));

-- -----------------------------------------------------------------------------
-- 2. class_join_links — tautan undangan kelas
-- -----------------------------------------------------------------------------
-- Token TIDAK pernah disimpan dalam bentuk asli, hanya SHA-256-nya, sehingga
-- bocornya isi tabel tidak membuat orang bisa masuk kelas. class_id tidak
-- pernah dikirim browser saat join — selalu diturunkan dari token di server.
create table if not exists class_join_links (
  id         uuid        primary key default gen_random_uuid(),
  class_id   uuid        not null,
  course_id  uuid        not null references courses (id) on delete cascade,
  token_hash text        not null unique,
  created_by uuid        references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid        references users (id) on delete set null,
  -- menjamin class_id benar-benar milik course_id (pola yang sama dgn course_members)
  foreign key (class_id, course_id) references classes (id, course_id) on delete cascade
);

create index if not exists class_join_links_class_idx on class_join_links (class_id);

-- Paling banyak SATU tautan aktif per kelas: "Regenerate" mencabut yang lama.
create unique index if not exists class_join_links_one_active_idx
  on class_join_links (class_id)
  where revoked_at is null;

-- -----------------------------------------------------------------------------
-- 3. Soft delete
-- -----------------------------------------------------------------------------
-- Tugas yang sudah punya submission TIDAK boleh dihapus permanen; histori nilai
-- harus utuh. Yang dipakai adalah archived_at.
alter table assignments
  add column if not exists archived_at timestamptz;

alter table assignment_templates
  add column if not exists archived_at timestamptz;

create index if not exists assignments_active_idx
  on assignments (course_id) where archived_at is null;

-- -----------------------------------------------------------------------------
-- 4. role_change_log — audit minimal perubahan role
-- -----------------------------------------------------------------------------
create table if not exists role_change_log (
  id             uuid        primary key default gen_random_uuid(),
  actor_user_id  uuid        references users (id) on delete set null,
  target_user_id uuid        references users (id) on delete cascade,
  from_role      user_role   not null,
  to_role        user_role   not null,
  created_at     timestamptz not null default now()
);

create index if not exists role_change_log_target_idx
  on role_change_log (target_user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 5. RLS deny-all pada tabel baru (pola yang sama dengan 0001)
-- -----------------------------------------------------------------------------
alter table class_join_links enable row level security;
alter table role_change_log  enable row level security;
