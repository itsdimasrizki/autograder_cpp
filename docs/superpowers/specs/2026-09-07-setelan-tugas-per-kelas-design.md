# Setelan Tugas Per Kelas

Tanggal: 2026-09-07
Status: disetujui, siap dibuatkan rencana implementasi

## 1. Latar

Konfigurasi tugas hari ini bersifat tunggal untuk seluruh course: satu baris
`assignments` memegang `deadline`, `max_attempts`, dan `scoring_mode` yang sama
untuk Kelas A sampai Kelas J. Hanya SUPER_ADMIN yang boleh menyentuhnya
(`canManageAssignment` = `isSuperAdmin`).

Kenyataannya tiap kelas berjalan sendiri-sendiri dengan asisten berbeda:

    Kelas A - asisten x
    Kelas B - asisten y
    Kelas C - asisten x

Jadwal praktikum, jumlah percobaan yang diizinkan, dan cara menilai berbeda per
kelas. Saat ini asisten harus meminta admin setiap kali, dan admin tidak punya
cara mengubahnya untuk satu kelas saja.

Dua temuan dari kode yang ikut membentuk desain ini:

1. **`deadline` dan `max_attempts` tidak pernah ditegakkan.** Keduanya hanya
   dibaca untuk ditampilkan (`components/assignment-cards.tsx:42,46` dan tabel
   daftar tugas). Tidak ada satu baris pun di `src/` yang menolak atau menandai
   submission karena lewat tenggat atau melebihi kuota. Konsep tenggat dirancang
   dari nol di dokumen ini, bukan diperbaiki.

2. **Waktu belum WIB.** `formatDate` (`components/ui.tsx:172`) memakai
   `toLocaleString("id-ID")` tanpa `timeZone`, jadi mengikuti zona waktu server
   (UTC di hosting) dan meleset 7 jam. `toLocalInputValue`
   (`app/assignments/[assignmentId]/page.tsx:47`) punya masalah yang sama, dan
   `optionalDate` (`lib/actions/assignments.ts:36`) menafsirkan isian
   `datetime-local` sebagai waktu server, sehingga tenggat yang diketik asisten
   tersimpan salah.

## 2. Keputusan yang sudah diambil

Diputuskan bersama pemilik produk sebelum desain ini ditulis:

| Pertanyaan | Keputusan |
|---|---|
| Field yang boleh berbeda per kelas | Tenggat, percobaan maksimal, mode penilaian. **Bukan** terbit/tarik. |
| Push setelah tenggat | Tidak dipakai untuk nilai di website. |
| Push melebihi kuota | Tidak dipakai untuk nilai di website. Repo tidak pernah dikunci. |
| Tampilan percobaan yang tersaring | Tetap tampil di riwayat, diberi label, nilainya diredupkan. |
| Cap waktu penentu keterlambatan | `updated_at` dari workflow run (waktu workflow selesai) — perilaku yang sudah berjalan sekarang. |
| Percobaan ERROR / masih berjalan | Tidak memakan jatah kuota. |
| Admin mengubah nilai dasar setelah asisten menyesuaikan | Admin memilih saat menyimpan: simpan biasa, atau terapkan ke semua kelas. |

## 3. Model izin

`canManageAssignment(ctx)` tetap `isSuperAdmin(ctx)` dan tetap menjaga apa yang
memang milik admin: membuat tugas, judul, deskripsi, template, nilai maksimal,
terbit/tarik, arsip/hapus, serta pengelolaan template.

Ditambah satu predikat murni di `src/lib/auth/policy.ts`:

```ts
/** Menyetel tenggat / percobaan / mode penilaian untuk SATU kelas. */
export function canManageClassAssignmentSettings(
  ctx: AccessContext,
  classId: string,
): boolean {
  return isSuperAdmin(ctx) || isAssistantOfClass(ctx, classId);
}
```

Sengaja memakai `isAssistantOfClass`, bukan `isAssistantOfCourse`. Itulah yang
membuat asisten y di Kelas B tidak bisa menyentuh Kelas A, dan sejalan dengan
`canManageClassRoster` yang sudah ada. Kasus satu asisten memegang beberapa
kelas (asisten x di Kelas A dan C) jalan tanpa tambahan apa pun karena
`course_members` sudah membolehkan seseorang punya beberapa baris kelas.

Mahasiswa tidak pernah termasuk: `isAssistantOfClass` hanya cocok pada baris
dengan `role = 'ASSISTANT'`.

## 4. Skema

Migrasi baru `supabase/migrations/0004_assignment_class_settings.sql`.

```sql
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
  foreign key (class_id, course_id) references classes (id, course_id) on delete cascade
);

create index if not exists assignment_class_settings_class_idx
  on assignment_class_settings (class_id);

alter table assignment_class_settings enable row level security;
```

Catatan skema:

- **Baris ada = kelas sudah disesuaikan; baris tidak ada = kelas ikut nilai
  dasar.** Ini alasan `deadline` dan `max_attempts` tetap boleh `null`: "tanpa
  tenggat" dan "tanpa batas percobaan" adalah nilai yang sah dan harus bisa
  dibedakan dari "belum pernah disetel".
- Composite FK `(class_id, course_id)` menjamin kelas benar-benar milik course
  tugas tersebut, mengikuti pola `course_members` dan `class_join_links`.
- `on delete cascade` dari `assignments` dan `classes`: setelan adalah data
  turunan, tidak ada nilai yang hilang saat induknya hilang.
- RLS deny-all tanpa policy, sama seperti seluruh tabel lain — akses hanya lewat
  service role di server.
- Trigger `set_updated_at` didaftarkan untuk tabel ini.

`src/lib/db/types.ts` menambah tipe `AssignmentClassSettings` dan mendaftarkannya
di `Database["public"]["Tables"]`.

## 5. Resolusi konfigurasi

Fungsi murni baru di `src/lib/grading/config.ts`, tanpa I/O sehingga dapat diuji
langsung:

```ts
export interface ResolvedAssignmentConfig {
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
  /** "KELAS" bila berasal dari override, "DASAR" bila ikut baris assignments. */
  source: "KELAS" | "DASAR";
}

export function resolveAssignmentConfig(
  assignment: Pick<Assignment, "deadline" | "max_attempts" | "scoring_mode">,
  override: AssignmentClassSettings | null,
): ResolvedAssignmentConfig;
```

Resolusinya seluruh-baris, bukan per-field: kalau `override` ada, ketiga nilainya
dipakai apa adanya; kalau `null`, ketiganya dari `assignment`.

**Alasan seluruh-baris, bukan per-field NULL.** Form asisten menampilkan ketiga
field sekaligus, terisi nilai yang sedang berlaku. Dengan per-field NULL, asisten
yang hanya bermaksud menggeser tenggat tidak akan sadar bahwa dua field lain
masih menempel ke nilai dasar dan bisa berubah kemudian tanpa sepengetahuannya.
Dengan materialisasi, apa yang dilihat asisten saat menekan simpan itulah yang
terkunci untuk kelasnya — tidak ada perubahan senyap.

`source` dipakai UI untuk membedakan lencana "disetel asisten" dan "ikut nilai
dasar", dan untuk menampilkan berapa kelas yang akan terdampak tombol "terapkan
ke semua kelas".

## 6. Konsep tenggat dan kuota percobaan

### 6.1 Aturan

> Sebuah percobaan **masuk hitungan nilai di website** kalau ia sudah
> menghasilkan nilai, waktunya tidak melewati tenggat kelasnya, dan urutannya
> masih di dalam kuota percobaan kelasnya.

Tiga saringan, dijalankan atas percobaan yang sudah diurut kronologis
(`submitted_at` menaik, `workflow_run_id` sebagai pemecah seri — urutan yang
sudah dipakai `byTimeAscending` di `gradebook.ts`):

**Saringan 1 — sudah dinilai.** Memakai `isScored` yang sudah ada: `score`
bukan `null` dan status termasuk `PASS`/`FAIL`/`ERROR`. Percobaan yang masih
`QUEUED`/`RUNNING`, atau `ERROR` tanpa nilai, dilewati sepenuhnya — tidak
dihitung, dan **tidak memakan jatah kuota**. Praktikan dengan kuota 1 yang push
pertamanya gagal kompilasi tidak kehilangan satu-satunya kesempatannya.

**Saringan 2 — tenggat.** `submitted_at <= deadline`. Bila `deadline` `null`,
saringan mati dan semua percobaan lolos.

**Saringan 3 — kuota.** Percobaan yang lolos saringan 1 diberi nomor urut
kronologis mulai dari 1; yang bernomor lebih besar dari `maxAttempts` tidak
dihitung. Nomor urut ini **tidak peduli tenggat**, sehingga push kedua yang
masih tepat waktu tetap "lewat kuota" bila kuotanya 1. Bila `maxAttempts`
`null`, saringan mati.

Saringan 2 dan 3 berdiri sendiri; satu percobaan bisa kena keduanya.

### 6.2 Algoritma

```
evaluateAttempts(submissions, config):
  sorted   = submissions diurut byTimeAscending
  quotaNo  = 0
  hasil    = []

  untuk tiap s di sorted:
    jika !isScored(s):
      hasil.push({ s, eligible: false, late: false, overQuota: false,
                   reason: "BELUM_DINILAI" })
      lanjut                                  // kuota tidak berkurang

    quotaNo += 1
    late      = config.deadline != null && s.submitted_at > config.deadline
    overQuota = config.maxAttempts != null && quotaNo > config.maxAttempts
    hasil.push({ s, eligible: !late && !overQuota, late, overQuota })

  kembalikan hasil
```

Nilai efektif dihitung hanya dari yang `eligible`, sesuai `scoringMode`:
`FIRST` = yang pertama, `LATEST` = yang terakhir, `BEST` = yang tertinggi.
`firstScore`, `latestScore`, dan `bestScore` di `StudentSummary` semuanya
dihitung atas himpunan `eligible` yang sama, supaya angka yang ditampilkan
tidak pernah bertentangan dengan nilai efektifnya.

Arti tiap field `StudentSummary` setelah perubahan, supaya tidak ada tafsir
ganda saat implementasi:

| Field | Dihitung dari |
|---|---|
| `attempts` | **seluruh** percobaan, termasuk yang tidak dihitung dan yang belum dinilai. Kolom "Percobaan" tetap menunjukkan berapa kali praktikan benar-benar push. |
| `countedAttempts` | baru — jumlah percobaan yang `eligible`. |
| `firstScore`, `latestScore`, `bestScore` | hanya percobaan yang `eligible`. |
| `effectiveScore` | salah satu dari ketiganya sesuai `scoringMode`; `null` bila tidak ada percobaan yang `eligible`. |
| `lastSubmittedAt` | percobaan **terakhir apa pun**, layak atau tidak. Kolom "Pengumpulan Terakhir" menjawab "kapan orang ini terakhir menyentuh tugasnya", bukan "kapan nilainya terbentuk". |
| `status` | status percobaan terakhir apa pun, seperti sekarang. |

Praktikan yang punya percobaan tetapi tidak satu pun layak menampilkan
`effectiveScore` `null` — di UI muncul sebagai `—` disertai keterangan singkat
bahwa seluruh percobaannya di luar tenggat atau kuota, bukan dibiarkan kosong
tanpa penjelasan.

### 6.3 Contoh

```
Kelas A · kuota 1 · tenggat 20:00 WIB · mode: nilai terbaik

#1  18:30  PASS   60   ✓ dihitung
#2  19:10  PASS   85   — lewat kuota
#3  21:00  PASS  100   — lewat kuota · terlambat

Nilai di website: 60
```

```
Kelas B · kuota 1 · tanpa tenggat · mode: nilai pertama

#1  18:30  ERROR   —   — belum dinilai, tidak memakan jatah
#2  18:45  PASS   70   ✓ dihitung
#3  19:20  PASS   90   — lewat kuota

Nilai di website: 70
```

### 6.4 Yang terjadi setelah tenggat lewat

- Repository GitHub praktikan **tidak dikunci**. Tidak ada cron, tidak ada
  pencabutan akses tulis. Praktikan bebas terus push dan berlatih di rumah.
- GitHub Actions **tetap berjalan** dan hasilnya tetap terlihat di tab Actions
  repo pribadi masing-masing. Ini di luar kendali aplikasi dan tidak disentuh.
- Webhook **tetap diterima dan submission tetap disimpan**. Tidak ada percobaan
  yang dibuang. `ingestGradingRun` tidak berubah sama sekali.
- Barisnya tetap muncul di "Riwayat Percobaan" dengan nilai terlihat namun
  diredupkan dan diberi label `tidak dihitung` / `terlambat`.
- Gradebook asisten hanya memakai percobaan yang lolos ketiga saringan.

**Seluruh penyaringan terjadi saat membaca, bukan saat menulis.** Tidak ada
kolom baru di `submissions` dan tidak ada perubahan pada jalur webhook.

### 6.5 Konsekuensi yang disadari

**Mengubah tenggat atau kuota langsung mengubah nilai yang tampil**, termasuk
untuk percobaan yang sudah lewat, karena kelayakan dihitung ulang tiap kali
halaman dibuka. Ini disengaja: asisten yang salah ketik tenggat bisa
membetulkannya dan nilai langsung pulih. Sisi tajamnya, memperketat tenggat
setelah praktikum selesai akan menurunkan nilai orang. Sifat ini sama dengan
`scoring_mode` yang sudah berlaku sekarang, jadi konsisten dengan janji
"berpindah mode tidak menghilangkan riwayat".

**Cap waktu memakai waktu workflow selesai, bukan waktu push.** `submitted_at`
diisi dari `run.updated_at` (`lib/grading/ingest.ts:157`), yang untuk run yang
sudah selesai berarti waktu tes selesai berjalan. Praktikan yang push 19:58 tapi
tesnya berjalan tiga menit tercatat 20:01 dan dicap terlambat meski push-nya
sebelum tenggat. Pilihan ini diambil sadar oleh pemilik produk demi menjaga
perilaku ingest tetap seperti sekarang. Mitigasinya bersifat operasional:
tetapkan tenggat dengan jeda longgar dari akhir sesi praktikum, misalnya sesi
selesai 20:00 dan tenggat diisi 20:15. Alternatif `run_started_at` dan field
"toleransi keterlambatan" sengaja **tidak** diimplementasikan; keduanya dicatat
di bagian Di Luar Lingkup.

## 7. Adu setelan admin dan asisten

Form "Ubah Tugas" milik admin mendapat dua tombol:

- **"Simpan perubahan"** — nilai dasar berubah. Kelas yang sudah punya baris
  override tidak bergerak sedikit pun.
- **"Simpan dan terapkan ke semua kelas"** — nilai dasar berubah, lalu seluruh
  baris `assignment_class_settings` milik tugas ini dihapus sehingga semua kelas
  kembali ikut nilai dasar. Memakai `ConfirmButton` yang sudah ada, dengan pesan
  yang menyebut jumlah kelas yang setelannya akan hilang.

Keduanya dibedakan lewat field tersembunyi `applyToAllClasses` di form yang sama,
diperiksa ulang dengan `canManageAssignment` di server.

Asisten tidak punya tombol kedua. Mereka hanya menulis baris kelasnya sendiri,
ditambah tombol **"Ikuti nilai dasar lagi"** yang menghapus baris kelasnya.

## 8. Waktu WIB

Modul baru `src/lib/time/wib.ts`, murni dan teruji:

```ts
export function formatWib(iso: string | null | undefined): string;
export function toWibInputValue(iso: string | null): string;
export function fromWibInput(text: string): string | null;
```

- `formatWib` memakai `toLocaleString("id-ID", { timeZone: "Asia/Jakarta", ... })`
  dan menambahkan akhiran `WIB`. `formatDate` di `components/ui.tsx:172`
  dialihkan memanggil ini, sehingga seluruh tampilan waktu di aplikasi ikut benar
  sekaligus — bukan hanya tenggat.
- `toWibInputValue` menghasilkan `"YYYY-MM-DDTHH:mm"` dalam waktu WIB untuk
  `<input type="datetime-local">`, menggantikan `toLocalInputValue` yang memakai
  zona waktu server.
- `fromWibInput` menafsirkan isian sebagai WIB lalu mengembalikan ISO UTC,
  menggantikan `new Date(text)` di `optionalDate`.

WIB tetap UTC+7 sepanjang tahun tanpa DST, jadi konversinya deterministik dan
tidak memerlukan pustaka tambahan. Penyimpanan tetap `timestamptz` UTC; hanya
lapisan tampilan dan input yang dipatok. Label field berubah menjadi
"Tenggat (WIB)".

## 9. Antarmuka

Pada `app/assignments/[assignmentId]/page.tsx`, tab kelas yang sudah ada menjadi
konteks setelan. Kartu baru **"Setelan Kelas — <nama kelas>"** muncul bagi siapa
pun yang lolos `canManageClassAssignmentSettings` untuk kelas terpilih, berisi:

- ringkasan read-only judul, template, dan nilai maksimal, supaya asisten tahu
  konteksnya tanpa bisa mengubahnya;
- tiga field: Tenggat (WIB), Percobaan maksimal, Mode penilaian, terisi nilai
  yang sedang berlaku;
- lencana `source`: "Disetel untuk kelas ini" atau "Mengikuti nilai dasar";
- tombol "Simpan setelan kelas" dan, bila baris override ada, "Ikuti nilai dasar
  lagi".

Admin melihat dua kartu: "Ubah Tugas" (nilai dasar, seperti sekarang, plus tombol
terapkan-ke-semua) dan "Setelan Kelas" yang sama seperti yang dilihat asisten.

Riwayat percobaan (tampilan mahasiswa) dan gradebook (tampilan asisten)
menampilkan label kelayakan. Kolom "Percobaan" di gradebook menjadi
`total (n dihitung)`. `formatScoreTrail` menampilkan percobaan yang tidak
dihitung dalam kurung, contoh `60 → (85) → (100)`.

Daftar tugas per course menampilkan tenggat kelas yang bersangkutan bagi
mahasiswa, dan penanda "berbeda per kelas" bagi staf bila ada override.

## 10. Titik sentuh

| Berkas | Perubahan |
|---|---|
| `supabase/migrations/0004_...sql` | baru — tabel, index, trigger, RLS |
| `src/lib/db/types.ts` | tipe `AssignmentClassSettings` + entri `Database` |
| `src/lib/db/assignment-class-settings.ts` | baru — list/get/upsert/delete/deleteAllForAssignment |
| `src/lib/grading/config.ts` | baru — `resolveAssignmentConfig` |
| `src/lib/grading/gradebook.ts` | `evaluateAttempts`; `summarizeStudent` menerima `ResolvedAssignmentConfig`; `StudentSummary` menambah `countedAttempts`; `formatScoreTrail` menandai yang tidak dihitung |
| `src/lib/auth/policy.ts` | `canManageClassAssignmentSettings` |
| `src/lib/time/wib.ts` | baru |
| `src/components/ui.tsx` | `formatDate` mengalihkan ke `formatWib` |
| `src/lib/actions/assignments.ts` | `optionalDate` memakai `fromWibInput`; `applyToAllClasses` pada update; aksi baru `updateClassSettingsAction`, `resetClassSettingsAction` |
| `src/lib/views/student-overview.ts` | menerima keanggotaan mahasiswa yang ditampilkan, meresolusi config per kelas |
| `src/app/assignments/[assignmentId]/page.tsx` | kartu Setelan Kelas, label kelayakan, tombol terapkan-ke-semua |
| `src/app/courses/[courseId]/assignments/page.tsx` | tenggat efektif / penanda "berbeda per kelas" |
| `src/app/dashboard/page.tsx`, `src/app/students/[studentId]/page.tsx` | menyesuaikan pemanggilan `buildStudentOverview` |

### Kelas mana yang berlaku untuk seorang mahasiswa

`unique (class_id, user_id)` di `course_members` tidak melarang seorang
mahasiswa terdaftar di dua kelas pada course yang sama, meskipun komentar di
`0001_init.sql` menyebut "tepat satu kelas per course". Agar tidak ada perilaku
yang bergantung pada urutan baris dari database, aturannya dipatok: **kelas yang
dipakai adalah keanggotaan `STUDENT` dengan `created_at` paling awal; bila sama,
`class_id` terkecil secara leksikografis.** Deterministik dan tidak memerlukan
perubahan skema.

## 11. Pengujian

Seluruh logika baru murni, jadi diuji tanpa database mengikuti pola `tests/`
yang sudah ada:

- `tests/attempt-eligibility.test.ts` — kombinasi tenggat x kuota x percobaan
  belum dinilai; termasuk kasus dari bagian 6.3, tenggat `null`, kuota `null`,
  percobaan ERROR di awal dan di tengah, serta percobaan dengan `submitted_at`
  identik (pemecah seri `workflow_run_id`).
- `tests/assignment-config.test.ts` — `resolveAssignmentConfig`: override ada vs
  tidak ada, override dengan `deadline`/`max_attempts` bernilai `null` (yang
  berarti "tanpa tenggat"/"tanpa batas", bukan "ikut nilai dasar").
- `tests/wib.test.ts` — konversi bolak-balik, lintas tengah malam WIB, dan isian
  kosong.
- `tests/gradebook.test.ts` — diperluas: nilai efektif tiap mode atas himpunan
  yang layak, `countedAttempts`, dan `formatScoreTrail` bertanda kurung.
- `tests/authorization.test.ts` — diperluas: asisten Kelas A ditolak pada Kelas
  B, diterima pada Kelas A dan C; mahasiswa selalu ditolak; SUPER_ADMIN diterima
  di semua kelas.

## 12. Di luar lingkup

Sengaja tidak dikerjakan, dicatat supaya keputusannya tidak hilang:

- **Terbit/tarik per kelas.** `published` tetap per-tugas dan tetap milik admin.
- **Toleransi keterlambatan (menit).** Tidak ada field denda maupun jeda.
- **`run_started_at` sebagai cap waktu.** Lihat bagian 6.5.
- **Penguncian repository GitHub saat tenggat atau kuota habis.** Tidak ada cron
  dan tidak ada pencabutan akses tulis.
- **Plafon tenggat.** Tenggat kelas bebas, tidak dibatasi tenggat dasar.
- **Nilai maksimal, judul, deskripsi, dan template per kelas.** Tetap tunggal
  untuk seluruh course.
