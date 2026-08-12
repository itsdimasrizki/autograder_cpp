# Praktikum Struktur Data C++

Repository ini dibuat otomatis oleh aplikasi praktikum. Setiap kali Anda
melakukan **push**, GitHub Actions akan mengompilasi kode Anda, menjalankan
test, dan mengirim nilainya ke aplikasi.

---

## Untuk Mahasiswa

### File yang Harus Dikerjakan

**Satu-satunya file yang Anda edit adalah:**

```
src/student.cpp
```

Jangan mengubah file lain. Perubahan pada `src/student.h`, `tests/checker.cpp`,
`tests/report.h`, atau `.github/workflows/` tidak akan membuat nilai Anda naik
dan dapat menyebabkan penilaian gagal.

### Cara Mengumpulkan

Tidak ada tombol "submit". **Push adalah pengumpulan.**

```bash
git clone https://github.com/<ORG>/praktikum-01-<username>.git
cd praktikum-01-<username>
# edit src/student.cpp
git add src/student.cpp
git commit -m "Kerjakan pertemuan 1"
git push
```

Lalu buka tab **Actions** di GitHub, atau lihat nilainya di aplikasi praktikum.

Anda boleh push berkali-kali. **Setiap percobaan tersimpan**, misalnya
40 → 70 → 100. Bergantung pada pengaturan tugas, yang dipakai adalah nilai
terbaik atau nilai terakhir.

### Membaca Hasil

| Status | Artinya |
|---|---|
| ✅ hijau | Semua test berhasil |
| ❌ merah | Ada test yang gagal atau compile error |

Klik run tersebut, lalu baca **Summary** — ada tabel nilai dan rincian setiap
test beserta keterangan kegagalannya.

| Step yang gagal | Penyebab |
|---|---|
| `Compile student.cpp` | Ada syntax/compile error di `student.cpp` |
| `Compile checker` | Nama atau signature fungsi tidak sesuai `student.h` |
| `Jalankan test & hitung score` | Kode berhasil dikompilasi tetapi hasilnya salah |

### Menjalankan Test di Komputer Sendiri (opsional)

Butuh `g++` yang mendukung C++17:

```bash
chmod +x scripts/run_tests.sh
./scripts/run_tests.sh
```

Alurnya sama persis dengan yang dijalankan GitHub Actions.

---

## Untuk Instruktur

### Mengadaptasi Template ke Pertemuan Baru

Cukup tiga berkas:

1. **`src/student.h`** — deklarasikan fungsi sesuai modul pertemuan.
2. **`src/student.cpp`** — sediakan starter code / skeleton.
3. **`tests/checker.cpp`** — tulis test case dengan `ASSERT_EQ` / `RUN_TEST`,
   lalu panggil test suite-nya dari `main()`.

`.github/workflows/test.yml`, `tests/report.h`, dan `scripts/` **tidak perlu
diubah** antar pertemuan.

### Hasil yang Dapat Dibaca Mesin

Checker menulis `result.json` di root repository, lalu workflow mengunggahnya
sebagai artifact bernama **`grading-result`**. Aplikasi praktikum mengunduh
artifact itu memakai GitHub App — nilai tidak pernah disimpulkan dari teks log.

```json
{
  "schema_version": 1,
  "score": 100,
  "passed": 14,
  "total": 14,
  "status": "PASS",
  "commit_sha": "...",
  "timestamp": "2026-08-12T10:00:00Z",
  "tests": [
    { "name": "tambah(2, 3) == 5", "status": "PASS", "points": 7.14, "message": "" }
  ]
}
```

Bila compile gagal atau checker crash, `scripts/write_error_result.sh` menulis
`result.json` berstatus `ERROR` dengan score 0, sehingga percobaan tersebut
tetap tercatat dan terlihat oleh asisten.

Bila menambah test suite baru, jangan ubah bentuk JSON-nya. Kalau memang harus
berubah, naikkan `schema_version` dan sesuaikan
`src/lib/grading/result.ts` di aplikasi.

### Menduplikasi Template ke 9 Pertemuan

Buat satu repository template per pertemuan
(`praktikum-01-template` … `praktikum-09-template`), tandai masing-masing
sebagai **Template repository** di Settings, lalu daftarkan di halaman Admin
aplikasi.

**Repository mahasiswa tidak dibuat manual** — aplikasi yang membuatnya lewat
GitHub App, sudah privat dan dengan hak akses yang benar.

### Catatan Keamanan

Mahasiswa dapat membaca `tests/checker.cpp` di repository-nya sendiri, dan
karena punya akses `push`, secara teknis dapat menyuntingnya.

Mitigasi yang sudah diterapkan:

- Test memakai beberapa nilai input berbeda, bukan satu nilai saja.
- Repository mahasiswa selalu privat.
- Workflow tidak memakai secret apa pun, sehingga tidak ada yang bisa dicuri.

Mitigasi lanjutan yang direkomendasikan (lihat README utama aplikasi):
bandingkan SHA berkas terkunci terhadap template, lalu tandai submission yang
berbeda.

---

## Struktur Repository

```
.
├── .github/workflows/test.yml     ← workflow penilaian (jangan diubah)
├── src/
│   ├── student.h                  ← interface (jangan diubah)
│   └── student.cpp                ← KERJAKAN DI SINI ←
├── tests/
│   ├── checker.cpp                ← test instruktur (jangan diubah)
│   └── report.h                   ← penulis result.json (jangan diubah)
├── scripts/
│   ├── run_tests.sh               ← uji lokal
│   ├── job_summary.py             ← Job Summary dari result.json
│   └── write_error_result.sh      ← result.json saat compile error
└── README.md
```

---

## Menunggu Modul Final

> **TODO (Instruktur):** isi setelah modul tiap pertemuan tersedia.

- [ ] Interface, starter code, dan test untuk Pertemuan 1 — Struktur Data C++ & GitHub
- [ ] Pertemuan 2 — Pointer
- [ ] Pertemuan 3 — Linked List Tunggal
- [ ] Pertemuan 4 — Linked List Ganda Circular
- [ ] Pertemuan 5 — Stack
- [ ] Pertemuan 6 — Queue
- [ ] Pertemuan 7 — PTB
- [ ] Pertemuan 8 — PTB
- [ ] Pertemuan 9 — Graf
