-- =============================================================================
-- 0004_assignment_class_settings.sql — setelan tugas per kelas
-- =============================================================================
-- Tenggat, percobaan maksimal, dan mode penilaian sebelumnya tunggal untuk
-- seluruh course. Kenyataannya tiap kelas berjalan sendiri dengan asisten
-- berbeda: jadwal praktikum, jumlah percobaan, dan cara menilai berbeda-beda.
--
-- ADA BARIS  = kelas ini sudah disesuaikan asistennya.
-- TIDAK ADA  = kelas ini mengikuti nilai dasar di tabel assignments.
--
-- Karena itu deadline dan max_attempts tetap boleh null: "tanpa tenggat" dan
-- "tanpa batas percobaan" adalah nilai yang sah dan harus bisa dibedakan dari
-- "belum pernah disetel".
--
-- Aman dijalankan berulang. Tidak menghapus atau mengubah data apa pun.
-- =============================================================================

create table if not exists assignment_class_settings (
  assignment_id uuid         not null references assignments (id) on delete cascade,
  class_id      uuid         not null,
  course_id     uuid         not null references courses (id) on delete cascade,
  deadline      timestamptz,
  max_attempts  int          check (max_attempts is null or max_attempts > 0),
  scoring_mode  scoring_mode not null,
  updated_by    uuid         references users (id) on delete set null,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  primary key (assignment_id, class_id),
  -- menjamin class_id benar-benar milik course_id, pola yang sama dengan
  -- course_members dan class_join_links
  foreign key (class_id, course_id) references classes (id, course_id) on delete cascade
);

create index if not exists assignment_class_settings_class_idx
  on assignment_class_settings (class_id);

drop trigger if exists assignment_class_settings_set_updated_at
  on assignment_class_settings;
create trigger assignment_class_settings_set_updated_at
  before update on assignment_class_settings
  for each row execute function set_updated_at();

-- RLS deny-all tanpa policy, sama seperti seluruh tabel lain: anon key tidak
-- dapat akses apa pun, service role di server mem-bypass RLS.
alter table assignment_class_settings enable row level security;
