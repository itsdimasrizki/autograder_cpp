# Panduan Pemasangan

Urutan yang disarankan: **Supabase → GitHub App → repo template → Vercel**.

---

## 1. Supabase

1. Buat project baru di <https://supabase.com> (region terdekat, mis. Singapore).
2. Buka **SQL Editor** → tempel seluruh isi
   `supabase/migrations/0001_init.sql` → **Run**.
   Skrip ini membuat semua tabel, enum, indeks, trigger, dan mengaktifkan RLS.
3. Opsional: jalankan `supabase/seed.sql` untuk membuat satu mata kuliah,
   10 kelas (A–J), dan 9 tugas pertemuan sebagai placeholder.
4. Buka **Settings → API** dan catat:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

> **service_role key mem-bypass RLS.** Simpan hanya sebagai environment
> variable di server. Jangan pernah menaruhnya di kode klien atau variabel
> berawalan `NEXT_PUBLIC_`.

Verifikasi cepat — RLS memang menutup akses lewat anon key:

```bash
curl "https://<PROJECT>.supabase.co/rest/v1/users?select=*" \
  -H "apikey: <ANON_KEY>"
# Harus mengembalikan array kosong / ditolak, bukan data pengguna.
```

---

## 2. GitHub App

Buat App di level **organisasi**:
`https://github.com/organizations/<ORG>/settings/apps/new`

### Pengaturan dasar

| Kolom | Nilai |
|---|---|
| GitHub App name | mis. `praktikum-strukdat` |
| Homepage URL | `https://<domain-anda>` |
| Callback URL | `https://<domain-anda>/api/auth/github/callback` |
| Request user authorization (OAuth) during installation | **dicentang** |
| Webhook → Active | **dicentang** |
| Webhook URL | `https://<domain-anda>/api/webhooks/github` |
| Webhook secret | string acak → `GITHUB_WEBHOOK_SECRET` |
| Where can this App be installed | Only on this account |

Untuk pengembangan lokal, tambahkan callback kedua
`http://localhost:3000/api/auth/github/callback` (GitHub App mengizinkan
beberapa callback URL).

### Izin

**Repository permissions**

| Izin | Level |
|---|---|
| Administration | Read & write |
| Contents | Read & write |
| Metadata | Read-only (otomatis) |
| Actions | Read-only |

**Organization permissions**

| Izin | Level |
|---|---|
| Members | Read-only |

**Subscribe to events:** centang **Workflow run** saja.

### Setelah App dibuat

1. Catat **App ID** → `GITHUB_APP_ID`.
2. Catat **Client ID** → `GITHUB_OAUTH_CLIENT_ID`.
3. **Generate a new client secret** → `GITHUB_OAUTH_CLIENT_SECRET`.
4. **Generate a private key** → berkas `.pem` terunduh →
   `GITHUB_APP_PRIVATE_KEY`.
5. **Install App** pada organisasi, pilih **All repositories** supaya repo
   mahasiswa yang baru dibuat otomatis tercakup.
6. Setelah dipasang, URL halaman instalasi berakhiran angka:
   `https://github.com/organizations/<ORG>/settings/installations/<ID>`
   → angka itulah `GITHUB_APP_INSTALLATION_ID`.

### Menaruh private key di environment variable

```bash
# Satu baris dengan \n literal (cocok untuk kolom env Vercel)
awk 'BEGIN{ORS="\\n"} {print}' nama-app.private-key.pem
```

Tempel hasilnya di antara tanda kutip ganda. Aplikasi mengembalikan `\n`
menjadi newline asli di `src/lib/env.ts`.

---

## 3. Repository Template

1. Buat repository baru di organisasi, mis. `praktikum-01-template`.
2. Salin seluruh isi folder `template/` dari proyek ini ke repo tersebut:

   ```bash
   cd template
   git init && git add -A
   git commit -m "Template praktikum"
   git remote add origin git@github.com:<ORG>/praktikum-01-template.git
   git push -u origin main
   ```

3. **Settings → General → centang "Template repository".** Tanpa ini, endpoint
   `generate` akan gagal.
4. Sesuaikan `src/student.h`, `src/student.cpp`, dan `tests/checker.cpp`
   dengan modul pertemuan yang bersangkutan.
5. Di aplikasi: **Admin → Daftarkan Repository Template**, isi owner dan nama
   repo. Lalu pilih template itu saat membuat tugas.

Buat satu repo template per pertemuan (`praktikum-01-template` …
`praktikum-09-template`) karena soal dan checker-nya berbeda.

> Repo template sebaiknya **privat**. Checker berisi kunci jawaban;
> repo mahasiswa yang dibuat darinya selalu privat.

---

## 4. Vercel

1. Import repository ini di <https://vercel.com/new>.
   Framework Next.js terdeteksi otomatis; tidak ada pengaturan build khusus.
2. **Settings → Environment Variables**, isi seluruh variabel pada tabel di
   [README.md § 4](README.md#4-environment-variables), untuk environment
   Production (dan Preview bila dipakai).
3. Deploy.
4. Setelah domain final diketahui, set `APP_URL` ke domain tersebut lalu
   **redeploy** — `APP_URL` dipakai untuk callback OAuth dan redirect.
5. Perbarui Callback URL dan Webhook URL pada GitHub App agar cocok dengan
   domain final.

Aplikasi tidak memakai proses berjalan lama, filesystem lokal, antrean, maupun
WebSocket, sehingga cocok untuk paket serverless gratis.

---

## 5. Pemeriksaan Setelah Deploy

1. **Login.** Buka `/login`, masuk dengan akun GitHub yang tercantum di
   `GITHUB_SUPER_ADMINS`. Role Anda harus tampil `SUPER_ADMIN` di navigasi.
2. **Struktur.** Admin → buat mata kuliah → buka mata kuliah → tambah kelas.
3. **Asisten.** Buka kelas → tugaskan asisten lewat username GitHub.
4. **Tugas.** Admin → daftarkan template → mata kuliah → Tugas → buat tugas →
   **Terbitkan**.
5. **Mahasiswa.** Sebagai asisten, buka kelas → tambah mahasiswa lewat username
   GitHub (diverifikasi langsung ke GitHub).
6. **Repository.** Buka tugas → pilih kelas → **Sediakan repository sekelas**.
   Repo privat `praktikum-01-<username>` akan muncul di organisasi, dan
   mahasiswa menerima undangan kolaborator.
7. **Penilaian.** Sebagai mahasiswa, ubah `src/student.cpp` lalu push. Workflow
   berjalan; dalam beberapa menit nilai muncul di gradebook.
8. **Webhook.** GitHub App → **Advanced → Recent Deliveries**. Kiriman
   `workflow_run` harus berbalas **200**. Balasan 401 berarti
   `GITHUB_WEBHOOK_SECRET` tidak cocok.

Bila webhook belum aktif atau ada kiriman yang terlewat, tombol **Segarkan
nilai** pada gradebook menarik ulang hasil lewat REST API. Penyerapannya
idempoten, jadi aman ditekan berkali-kali.

---

## 6. Pemecahan Masalah

| Gejala | Kemungkinan sebab |
|---|---|
| `state_tidak_valid` saat login | `APP_URL` tidak sama dengan domain yang dibuka, atau cookie diblokir |
| Webhook dibalas 401 | `GITHUB_WEBHOOK_SECRET` berbeda dengan yang di GitHub App |
| Webhook dibalas 200 tapi nilai tidak muncul | Repo belum tercatat di `student_repositories` — sediakan repo lewat aplikasi, jangan buat manual |
| `generate` gagal HTTP 404 | Repo sumber belum ditandai sebagai **Template repository** |
| `generate` gagal HTTP 403 | Izin App kurang, atau App tidak dipasang dengan **All repositories** |
| Nilai selalu `—` padahal workflow hijau | Artifact `grading-result` tidak terunggah; periksa langkah upload pada `test.yml` |
| `SESSION_SECRET minimal 32 karakter` | Nilai env terlalu pendek |
