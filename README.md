# Praktikum Struktur Data — Control Plane

Aplikasi web untuk mengelola tugas praktikum C++ dan nilai otomatisnya.

Aplikasi ini **bukan** LMS, **bukan** IDE daring, dan **bukan** server compiler.
Semua kode C++ dikompilasi dan dinilai oleh **GitHub Actions** di dalam
repository mahasiswa. Aplikasi ini hanya mengurus tugas, kelas, identitas,
penyediaan repository, serta menyimpan dan menampilkan hasil penilaian.

Skala sasaran: ±10 kelas, ±20 mahasiswa per kelas (±200 mahasiswa), 9 pertemuan.

---

## 1. Arsitektur

```
                        ┌──────────────────────────────┐
   Login GitHub ───────▶│  Next.js (App Router)        │
                        │  di Vercel — serverless      │
   Admin / Asisten ────▶│                              │
   Mahasiswa      ────▶ │  · server component          │
                        │  · server action             │
                        │  · route handler             │
                        └───────┬───────────┬──────────┘
                                │           │
                 GitHub App     │           │  service role
                 (REST API)     │           │
                                ▼           ▼
                        ┌───────────────┐  ┌──────────────────┐
                        │    GitHub     │  │ Supabase Postgres │
                        │               │  │ (RLS deny-all)    │
                        │ repo template │  └──────────────────┘
                        │ repo mahasiswa│           ▲
                        │ Actions       │           │
                        └───────┬───────┘           │
                                │                   │
    git push ──▶ workflow ──▶ result.json ──▶ webhook workflow_run
                 compile        (artifact)      + unduh artifact
                 checker
```

**Alur satu percobaan pengumpulan**

1. Mahasiswa `git push` ke repository privatnya.
2. GitHub Actions mengompilasi `src/student.cpp` (C++17), mengompilasi
   `tests/checker.cpp` milik instruktur, lalu menjalankannya.
3. Checker menulis `result.json` (score 0–100, daftar test) **dan** Job Summary
   yang mudah dibaca. Keduanya berasal dari sumber yang sama.
4. `result.json` diunggah sebagai artifact bernama `grading-result`.
5. GitHub mengirim webhook `workflow_run` ke `/api/webhooks/github`.
6. Aplikasi memverifikasi tanda tangan HMAC, mengunduh artifact memakai token
   GitHub App, memvalidasi JSON-nya, lalu menyimpan satu baris `submissions`
   beserta rincian `test_results`.
7. Asisten melihat gradebook; mahasiswa melihat riwayat nilainya.

**Keputusan desain yang penting**

| Keputusan | Alasan |
|---|---|
| Hasil dibaca dari artifact JSON, bukan dari teks log | Format stabil dan bisa divalidasi; log terminal mudah berubah |
| Repository mahasiswa **tidak menyimpan secret apa pun** | Mahasiswa punya akses push ke reponya; secret apa pun di sana dapat dicuri dan dipakai memalsukan nilai. Aplikasi yang **menarik** hasil, bukan Actions yang mengirim |
| Cookie sesi hanya berisi `users.id` | Role selalu dibaca ulang dari database, sehingga cookie yang dimanipulasi tidak bisa menaikkan hak akses |
| Keanggotaan disimpan pada level **kelas** | Asisten Kelas A benar-benar tidak dapat menyentuh Kelas B |
| RLS aktif tanpa policy | Anon key yang bocor tidak dapat membaca apa pun; seluruh akses lewat service role + otorisasi aplikasi |
| Setiap percobaan disimpan | Riwayat 40 → 70 → 100 tidak pernah ditimpa |

---

## 2. Struktur Folder

```
web_strukdat/
├── src/
│   ├── app/
│   │   ├── login/                     halaman masuk
│   │   ├── dashboard/                 dasbor sesuai role
│   │   ├── courses/                   daftar mata kuliah
│   │   │   └── [courseId]/
│   │   │       └── assignments/       daftar & pembuatan tugas
│   │   ├── classes/[classId]/         roster kelas + pintu gradebook
│   │   ├── assignments/[assignmentId] gradebook / tampilan mahasiswa
│   │   ├── students/[studentId]/      riwayat seorang mahasiswa
│   │   ├── admin/                     mata kuliah, template, role
│   │   └── api/
│   │       ├── auth/github/           mulai OAuth
│   │       ├── auth/github/callback/  tukar code -> sesi
│   │       ├── auth/logout/
│   │       └── webhooks/github/       penerima workflow_run
│   ├── components/                    primitif UI (tanpa client JS)
│   └── lib/
│       ├── auth/
│       │   ├── policy.ts              ★ SEMUA aturan otorisasi (murni)
│       │   ├── authorize.ts           pemuat konteks otorisasi
│       │   ├── session.ts             token sesi HMAC (murni)
│       │   ├── github-oauth.ts        alur OAuth
│       │   └── current-user.ts        cookie + pengguna saat ini
│       ├── db/                        akses Supabase bertipe
│       ├── github/                    ★ SATU-SATUNYA tempat memanggil GitHub
│       │   ├── app.ts                 JWT App + installation token
│       │   ├── client.ts              pembungkus REST
│       │   ├── repos.ts               buat repo dari template, kolaborator
│       │   ├── actions.ts             workflow run + artifact
│       │   ├── webhook.ts             verifikasi HMAC (murni)
│       │   └── naming.ts              penamaan repo (murni)
│       ├── grading/
│       │   ├── result.ts              ★ parsing result.json (murni)
│       │   ├── unzip.ts               pembaca ZIP artifact (murni)
│       │   ├── ingest.ts              ★ penyimpanan idempoten
│       │   ├── sync.ts                jembatan GitHub -> database
│       │   └── gradebook.ts           ringkasan nilai (murni)
│       ├── provisioning/provision.ts  penyediaan repo mahasiswa
│       ├── actions/                   server action + validasi zod
│       └── views/                     penyusun data halaman
├── supabase/
│   ├── migrations/                    0001 skema+RLS, 0002 join link,
│   │                                  0003 mode nilai pertama
│   └── seed.sql                       1 course, 10 kelas, 9 pertemuan
├── template/                          ★ template repo praktikum (C++)
│   ├── src/student.cpp                dikerjakan mahasiswa
│   ├── src/student.h                  antarmuka (dikunci)
│   ├── tests/checker.cpp              test instruktur
│   ├── tests/report.h                 penulis result.json
│   ├── scripts/run_tests.sh           uji lokal
│   ├── scripts/job_summary.py         Job Summary dari result.json
│   ├── scripts/write_error_result.sh  result.json saat compile error
│   └── .github/workflows/test.yml     workflow penilaian
├── tests/                             vitest (155 test)
└── DEPLOYMENT.md                      Supabase, GitHub App, Vercel
```

★ = modul yang sengaja diisolasi sesuai aturan implementasi.

---

## 3. Skema Database

Sumber kebenaran: `supabase/migrations/0001_init.sql`.

```
users ──┬── course_members ──┬── classes ── courses
        │                    └── (role: ASSISTANT | STUDENT)
        ├── student_repositories ── assignments ── courses
        └── submissions ──┬── assignments
                          ├── student_repositories
                          └── test_results
                                            assignment_templates ── assignments
```

| Tabel | Isi | Kunci penting |
|---|---|---|
| `users` | identitas GitHub + role global | `github_user_id` unik |
| `courses` | mis. "Praktikum Struktur Data 2026" | |
| `classes` | Kelas A..J di dalam course | unik `(course_id, name)` |
| `course_members` | keanggotaan pada level **kelas** | unik `(class_id, user_id)`, FK gabungan menjamin kelas milik course yang benar |
| `assignment_templates` | repo template instruktur | unik `(owner, repo)` |
| `assignments` | satu per pertemuan | unik `(course_id, meeting_number)` |
| `student_repositories` | repo privat per (mahasiswa, tugas) | unik `(assignment_id, user_id)` dan `full_name` |
| `submissions` | **setiap** percobaan | unik `(student_repository_id, workflow_run_id, run_attempt)` ← kunci idempotensi |
| `test_results` | rincian per test case | cascade dari submission |

Enum: `user_role`, `member_role`, `scoring_mode`
(`BEST`/`LATEST`/`FIRST`), `submission_status`
(`QUEUED`/`RUNNING`/`PASS`/`FAIL`/`ERROR`), `test_status`, `repo_status`.

Mode penilaian hanya **memilih** nilai mana yang berlaku; nilai pertama,
terbaik, dan terakhir ketiganya selalu dihitung dari riwayat submission. Karena
itu mode sebuah tugas boleh dibolak-balik tanpa kehilangan data.

RLS aktif pada seluruh tabel **tanpa policy**: hanya service role (server) yang
dapat mengaksesnya.

---

## 4. Environment Variables

Semua bersifat server-side. **Tidak ada** yang berawalan `NEXT_PUBLIC_`.

| Variabel | Wajib | Keterangan |
|---|---|---|
| `SUPABASE_URL` | ya | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | Service role. Jangan pernah ke browser |
| `SESSION_SECRET` | ya | ≥32 karakter acak (`openssl rand -hex 32`) |
| `GITHUB_OAUTH_CLIENT_ID` | ya | Client ID GitHub App/OAuth App |
| `GITHUB_OAUTH_CLIENT_SECRET` | ya | Client secret |
| `GITHUB_APP_ID` | ya | ID numerik GitHub App |
| `GITHUB_APP_PRIVATE_KEY` | ya | PEM lengkap (newline boleh ditulis `\n`) |
| `GITHUB_APP_INSTALLATION_ID` | ya | ID pemasangan App pada organisasi |
| `GITHUB_WEBHOOK_SECRET` | ya | Secret webhook GitHub App |
| `GITHUB_ORG` | ya | Organisasi tempat repo mahasiswa dibuat |
| `GITHUB_SUPER_ADMINS` | ya (awal) | Username GitHub calon admin, dipisah koma |
| `APP_URL` | ya | mis. `https://praktikum.vercel.app` |

`GITHUB_SUPER_ADMINS` adalah satu-satunya jalan mendapatkan admin pertama.
Browser tidak pernah dapat menaikkan rolenya sendiri.

---

## 5. Izin GitHub App

Sesempit yang masih memungkinkan seluruh alur berjalan.

**Repository permissions**

| Izin | Level | Dipakai untuk |
|---|---|---|
| Administration | Read & write | membuat repo dari template, mengatur kolaborator |
| Contents | Read & write | `POST /repos/{owner}/{repo}/generate`, membaca berkas |
| Metadata | Read-only | wajib bagi semua GitHub App |
| Actions | Read-only | membaca workflow run dan mengunduh artifact |

**Organization permissions**

| Izin | Level | Dipakai untuk |
|---|---|---|
| Members | Read-only | memeriksa keanggotaan organisasi (opsional) |

**Subscribe to events:** `Workflow run` saja.

**Pemasangan:** pasang App pada organisasi dengan pilihan **All repositories**,
supaya repo mahasiswa yang baru dibuat langsung tercakup.

> Catatan jujur: kombinasi izin di atas belum diverifikasi terhadap organisasi
> GitHub sungguhan (butuh konfigurasi eksternal). Bila `generate` ditolak
> HTTP 403, tambahkan izin organisasi yang diminta pesan error tersebut, lalu
> perbarui tabel ini.

---

## 6. Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env.local     # isi nilainya
npm run dev                    # http://localhost:3000
```

Perintah lain:

```bash
npm run typecheck              # tsc --noEmit
npm test                       # vitest (83 test)
npm run build                  # build produksi
```

Menguji engine C++ tanpa GitHub:

```bash
cd template
./scripts/run_tests.sh         # compile + jalankan checker
GITHUB_SHA=lokal ./checker_bin # menulis result.json
python3 scripts/job_summary.py result.json
```

Untuk Supabase, GitHub App, dan Vercel: lihat **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 7. Hasil Pengujian

```
 ✓ tests/authorization.test.ts    (21 test)
 ✓ tests/session.test.ts          (13 test)
 ✓ tests/grading-result.test.ts   (15 test)
 ✓ tests/grading-ingest.test.ts   (12 test)
 ✓ tests/provisioning.test.ts     (12 test)
 ✓ tests/gradebook.test.ts        (10 test)

 Test Files  6 passed (6)
      Tests  83 passed (83)
```

Yang dijamin oleh test tersebut, termasuk seluruh syarat minimum:

- Mahasiswa A tidak dapat membaca submission Mahasiswa B (bahkan sekelas).
- Asisten Kelas A tidak dapat mengakses Kelas B.
- Role `ASSISTANT` tanpa penugasan kelas tidak memberi akses apa pun.
- Score 100 tersimpan benar; score 71 tersimpan benar.
- Event GitHub Actions ganda **tidak** membuat submission ganda.
- Webhook terlambat tidak menghapus nilai final yang sudah tersimpan.
- Riwayat 40 → 70 → 100 tersimpan sebagai tiga baris terpisah.
- Tugas draf tidak terlihat oleh mahasiswa.
- Tanda tangan webhook yang salah ditolak.
- `result.json` dibaca dari artifact ZIP sungguhan (deflate & stored).
- Cookie sesi yang dipalsukan/kedaluwarsa ditolak dan tidak memuat role.
- Redirect hanya boleh ke path internal.

Pengujian menyasar logika murni (otorisasi, parsing, idempotensi, ringkasan
nilai) memakai penyimpanan in-memory yang meniru batasan unique di SQL.
Jalur yang menyentuh jaringan sungguhan (Supabase, REST GitHub) tidak diuji
otomatis — lihat batasan di bawah.

---

## 8. Batasan yang Diketahui

1. **Mahasiswa dapat mengubah workflow dan checker di repo-nya.**
   Akses `push` mengizinkan penyuntingan `.github/workflows/` dan
   `tests/checker.cpp`, sehingga secara teknis nilai dapat dipalsukan. Ini
   sengaja belum ditangani agar cakupan MVP tetap kecil. Mitigasi yang
   direkomendasikan ada di bagian 9.
2. **Belum diuji terhadap GitHub dan Supabase sungguhan.** Semua pemanggilan
   jaringan ditulis sesuai dokumentasi REST GitHub, tetapi butuh sekali uji
   ujung-ke-ujung setelah GitHub App dibuat.
3. **Artifact kedaluwarsa setelah 90 hari.** Setelah itu `result.json` tidak
   dapat diunduh ulang; nilai yang sudah tersimpan tetap aman, tetapi
   "Segarkan" tidak dapat merekonstruksi percobaan lama.
4. **Tanpa rate limit sendiri.** Bergantung pada batas milik Vercel dan GitHub.
5. **`max_attempts` belum dipaksakan.** Nilainya tersimpan dan ditampilkan,
   tetapi push melebihi batas tetap dinilai (GitHub yang menjalankan, bukan
   aplikasi). Penegakan perlu dilakukan di sisi workflow.
6. **Tenggat tidak menutup pengumpulan.** `deadline` bersifat informatif;
   percobaan setelah tenggat tetap tercatat (dan terlihat waktunya).
7. **Penyediaan repository berjalan berurutan** dalam satu request. Untuk 20
   mahasiswa masih nyaman; kelas yang jauh lebih besar berisiko menyentuh batas
   waktu fungsi serverless — jalankan per mahasiswa bila itu terjadi.
8. **Username GitHub yang berubah** akan diperbarui saat mahasiswa login lagi,
   tetapi nama repo yang sudah dibuat tidak ikut berubah.
9. **Belum ada ekspor nilai** (CSV/XLSX).

---

## 9. Milestone Berikutnya yang Disarankan

**Prioritas 1 — integritas penilaian.** Bandingkan SHA blob berkas terkunci
(`tests/checker.cpp`, `tests/report.h`, `.github/workflows/test.yml`) pada
commit yang dinilai terhadap template, lalu tandai submission yang berbeda.
Butuh dua kolom (`integrity_ok`, `integrity_note`), satu fungsi di
`src/lib/github/repos.ts` (`getFileSha` sudah tersedia), dan satu lencana di
gradebook. Ini menutup batasan nomor 1 dengan biaya kecil.

Setelah itu, sesuai kebutuhan: ekspor gradebook ke CSV, penegakan
`max_attempts`/tenggat di dalam workflow, dan halaman kesehatan sinkronisasi
(daftar workflow run yang gagal diserap).
