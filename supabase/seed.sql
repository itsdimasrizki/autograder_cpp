-- =============================================================================
-- seed.sql — Data awal (opsional, aman dijalankan berulang)
-- =============================================================================
-- Membuat satu course, 10 kelas (A..J), dan 9 tugas pertemuan sebagai
-- placeholder. Soal praktikum yang sesungguhnya diisi belakangan lewat UI.
--
-- SUPER_ADMIN tidak di-seed di sini: akun pertama yang login dengan username
-- GitHub yang terdaftar di env GITHUB_SUPER_ADMINS otomatis menjadi SUPER_ADMIN.
-- =============================================================================

insert into courses (name, term, description)
values ('Praktikum Struktur Data', '2026',
        'Praktikum Struktur Data menggunakan C++17 dengan penilaian otomatis GitHub Actions.')
on conflict do nothing;

-- Kelas A .. J
with c as (select id from courses where name = 'Praktikum Struktur Data' and term = '2026' limit 1)
insert into classes (course_id, name)
select c.id, 'Kelas ' || l
from c, unnest(array['A','B','C','D','E','F','G','H','I','J']) as l
on conflict (course_id, name) do nothing;

-- 9 pertemuan
with c as (select id from courses where name = 'Praktikum Struktur Data' and term = '2026' limit 1)
insert into assignments (course_id, meeting_number, title, published, scoring_mode, max_score)
select c.id, m.n, m.title, false, 'BEST', 100
from c, (values
  (1, 'Pertemuan 1 - Struktur Data C++ & GitHub'),
  (2, 'Pertemuan 2 - Pointer'),
  (3, 'Pertemuan 3 - Linked List Tunggal'),
  (4, 'Pertemuan 4 - Linked List Ganda Circular'),
  (5, 'Pertemuan 5 - Stack'),
  (6, 'Pertemuan 6 - Queue'),
  (7, 'Pertemuan 7 - PTB'),
  (8, 'Pertemuan 8 - PTB'),
  (9, 'Pertemuan 9 - Graf')
) as m(n, title)
on conflict (course_id, meeting_number) do nothing;
