# Setelan Tugas Per Kelas — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asisten dapat menyetel tenggat, percobaan maksimal, dan mode penilaian untuk kelas yang diasuhnya sendiri di atas nilai dasar milik SUPER_ADMIN; tenggat dan kuota mulai benar-benar menyaring nilai yang tampil; seluruh waktu ditampilkan dan dibaca dalam WIB.

**Architecture:** Tabel baru `assignment_class_settings` menyimpan override per (tugas, kelas) — baris ada berarti kelas sudah disesuaikan, baris tidak ada berarti ikut nilai dasar di `assignments`. Seluruh penyaringan kelayakan percobaan terjadi **saat membaca** lewat fungsi murni di `src/lib/grading/`, jadi jalur webhook dan tabel `submissions` tidak berubah sama sekali dan tidak ada riwayat yang dibuang. Otorisasi memakai satu predikat baru berbasis kelas di `src/lib/auth/policy.ts`, mengikuti pola `canManageClassRoster` yang sudah ada.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript strict, Supabase (postgres-js, service role, RLS deny-all), Zod 3, Vitest 2, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-07-setelan-tugas-per-kelas-design.md`

## Global Constraints

- **Bahasa.** Seluruh komentar kode, pesan error yang dilihat pengguna, teks UI, judul test, dan pesan commit ditulis dalam bahasa Indonesia. Ini konsisten dengan seluruh berkas yang sudah ada.
- **Gaya pesan commit.** Kalimat perintah/pernyataan bahasa Indonesia tanpa awalan `feat:`/`fix:` — mengikuti riwayat repo (`Tambah mode penilaian "nilai pertama"`, `Hitung percobaan hanya dari push praktikan, bukan commit provisioning`).
- **Trailer commit.** Setiap commit diakhiri dua baris berikut, dipisahkan satu baris kosong dari isi pesan:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
  ```

- **JANGAN COMMIT.** Pengguna yang melakukan seluruh commit sendiri. Setiap langkah bernama "Commit" pada rencana ini **dilewati**: jalankan perintah verifikasinya, laporkan hasilnya, lalu lanjut ke task berikutnya dengan perubahan tetap berada di working tree. Jangan pernah menjalankan `git commit`, `git add`, `git stash`, atau `git checkout` yang membuang perubahan. Blok pesan commit yang tertulis di tiap task dipertahankan sebagai bahan siap pakai bila nanti pengguna memintanya.
- **Zona waktu.** `Asia/Jakarta`, tetap UTC+7 sepanjang tahun tanpa DST. Penyimpanan tetap `timestamptz` UTC; hanya lapisan tampilan dan isian form yang dipatok ke WIB. Dilarang menambah pustaka tanggal apa pun.
- **Batas lapisan.** Berkas di `src/lib/db/**` dan `src/lib/views/**` wajib diawali `import "server-only";`. Berkas di `src/lib/grading/**`, `src/lib/auth/policy.ts`, dan `src/lib/time/**` harus tetap **murni tanpa I/O** supaya bisa diuji tanpa database — jangan menambahkan `server-only` ke sana.
- **Alias impor.** Selalu `@/lib/...`, `@/components/...` — jangan pernah path relatif lintas direktori.
- **Perintah verifikasi.** `npm test` (Vitest, seluruh berkas `tests/**/*.test.ts`) dan `npm run typecheck` (`tsc --noEmit`). Keduanya harus hijau sebelum tiap commit.
- **Yang tidak boleh disentuh.** `src/lib/grading/ingest.ts`, `src/lib/grading/sync.ts`, `src/app/api/webhooks/github/route.ts`, dan tabel `submissions` tidak berubah sama sekali dalam rencana ini. Penyaringan kelayakan adalah operasi baca.

## Struktur Berkas

Dibuat baru:

| Berkas | Tanggung jawab |
|---|---|
| `src/lib/time/wib.ts` | Satu-satunya tempat konversi dan format waktu WIB. Murni. |
| `src/lib/grading/config.ts` | Meresolusi konfigurasi berlaku (override kelas vs nilai dasar) dan memilih kelas mana yang berlaku bagi seorang mahasiswa. Murni. |
| `src/lib/db/assignment-class-settings.ts` | Akses tabel `assignment_class_settings`. Hanya I/O, tanpa aturan. |
| `supabase/migrations/0004_assignment_class_settings.sql` | Tabel, index, trigger, RLS. |
| `tests/wib.test.ts`, `tests/assignment-config.test.ts`, `tests/attempt-eligibility.test.ts` | Uji ketiga modul murni di atas. |

Diubah: `src/lib/db/types.ts`, `src/lib/db/courses.ts`, `src/lib/grading/gradebook.ts`, `src/lib/auth/policy.ts`, `src/lib/actions/assignments.ts`, `src/lib/views/student-overview.ts`, `src/components/ui.tsx`, `src/components/assignment-cards.tsx`, `src/app/assignments/[assignmentId]/page.tsx`, `src/app/courses/[courseId]/assignments/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/students/[studentId]/page.tsx`, `tests/gradebook.test.ts`, `tests/authorization.test.ts`.

---

### Task 1: Modul waktu WIB

Modul murni tanpa ketergantungan pada tugas lain. Dikerjakan pertama karena Task 2 dan Task 10 memakainya.

**Files:**
- Create: `src/lib/time/wib.ts`
- Test: `tests/wib.test.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces:
  - `formatWib(value: string | null | undefined): string`
  - `toWibInputValue(value: string | null | undefined): string`
  - `fromWibInput(text: string): string | null`

- [ ] **Step 1: Tulis test yang gagal**

Buat `tests/wib.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatWib, fromWibInput, toWibInputValue } from "@/lib/time/wib";

describe("format waktu WIB", () => {
  it("menampilkan jam WIB, bukan jam UTC", () => {
    // 13:15 UTC = 20:15 WIB pada hari yang sama.
    const hasil = formatWib("2026-09-07T13:15:00.000Z");
    expect(hasil).toMatch(/07/);
    expect(hasil).toMatch(/20[.:]15/);
    expect(hasil).toMatch(/ WIB$/);
  });

  it("menampilkan strip untuk nilai kosong atau tidak valid", () => {
    expect(formatWib(null)).toBe("—");
    expect(formatWib(undefined)).toBe("—");
    expect(formatWib("")).toBe("—");
    expect(formatWib("bukan tanggal")).toBe("—");
  });
});

describe("isian datetime-local", () => {
  it("mengubah instant UTC menjadi jam dinding WIB", () => {
    expect(toWibInputValue("2026-09-07T13:15:00.000Z")).toBe("2026-09-07T20:15");
  });

  it("melewati tengah malam WIB dengan benar", () => {
    // 17:00 UTC tanggal 7 sudah menjadi 00:00 WIB tanggal 8.
    expect(toWibInputValue("2026-09-07T17:00:00.000Z")).toBe("2026-09-08T00:00");
  });

  it("mengembalikan string kosong untuk nilai kosong", () => {
    expect(toWibInputValue(null)).toBe("");
    expect(toWibInputValue("bukan tanggal")).toBe("");
  });
});

describe("membaca isian sebagai WIB", () => {
  it("menafsirkan isian sebagai WIB lalu menyimpannya sebagai UTC", () => {
    expect(fromWibInput("2026-09-07T20:15")).toBe("2026-09-07T13:15:00.000Z");
  });

  it("melewati tengah malam WIB dengan benar", () => {
    expect(fromWibInput("2026-09-08T00:00")).toBe("2026-09-07T17:00:00.000Z");
  });

  it("bolak-balik tanpa kehilangan nilai", () => {
    const asal = "2026-12-31T17:30:00.000Z";
    expect(fromWibInput(toWibInputValue(asal))).toBe(asal);
  });

  it("isian kosong berarti tanpa tenggat", () => {
    expect(fromWibInput("")).toBeNull();
    expect(fromWibInput("   ")).toBeNull();
  });

  it("menolak isian yang bukan tanggal", () => {
    expect(() => fromWibInput("besok sore")).toThrow("Tenggat tidak valid.");
  });

  it("menolak tanggal yang tidak ada, bukan menggesernya diam-diam", () => {
    // Date.UTC menggulung 31 Februari menjadi 3 Maret; itu harus ditolak.
    expect(() => fromWibInput("2026-02-31T10:00")).toThrow("Tenggat tidak valid.");
    expect(() => fromWibInput("2026-13-01T10:00")).toThrow("Tenggat tidak valid.");
    expect(() => fromWibInput("2026-09-07T25:00")).toThrow("Tenggat tidak valid.");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/wib.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/time/wib"`.

- [ ] **Step 3: Tulis implementasi**

Buat `src/lib/time/wib.ts`:

```ts
/**
 * Waktu WIB (Asia/Jakarta).
 *
 * Penyimpanan tetap UTC pada kolom timestamptz; modul ini hanya menjembatani
 * lapisan tampilan dan isian form. WIB tidak mengenal daylight saving —
 * pergeserannya tetap +7 jam sepanjang tahun — sehingga konversinya
 * deterministik dan tidak memerlukan pustaka tanggal apa pun.
 *
 * Modul ini murni tanpa I/O supaya dapat diuji langsung.
 */

/** Selisih WIB terhadap UTC, dalam milidetik. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Contoh: "07 Sep 2026, 20.15 WIB". */
export function formatWib(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "—";

  const teks = date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${teks} WIB`;
}

/**
 * "YYYY-MM-DDTHH:mm" dalam jam dinding WIB, bentuk yang dipahami
 * <input type="datetime-local">.
 *
 * Digeser +7 jam lalu dibaca lewat getUTC*, sehingga hasilnya tidak pernah
 * bergantung pada zona waktu server yang menjalankannya.
 */
export function toWibInputValue(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "";

  const w = new Date(date.getTime() + WIB_OFFSET_MS);
  return (
    `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}` +
    `T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`
  );
}

const INPUT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Kebalikan toWibInputValue: menafsirkan isian sebagai jam dinding WIB dan
 * mengembalikannya sebagai ISO UTC. Isian kosong berarti "tanpa tenggat".
 *
 * Date.UTC menggulung tanggal yang tidak ada (31 Februari menjadi 3 Maret),
 * jadi hasilnya diperiksa ulang komponen per komponen. Tanpa itu, salah ketik
 * tenggat akan tersimpan diam-diam sebagai tanggal lain.
 */
export function fromWibInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const cocok = INPUT_PATTERN.exec(trimmed);
  if (!cocok) throw new Error("Tenggat tidak valid.");

  const [, tahun, bulan, tanggal, jam, menit, detik] = cocok;
  const utc = new Date(
    Date.UTC(
      Number(tahun),
      Number(bulan) - 1,
      Number(tanggal),
      Number(jam),
      Number(menit),
      Number(detik ?? 0),
    ),
  );

  const utuh =
    utc.getUTCFullYear() === Number(tahun) &&
    utc.getUTCMonth() === Number(bulan) - 1 &&
    utc.getUTCDate() === Number(tanggal) &&
    utc.getUTCHours() === Number(jam) &&
    utc.getUTCMinutes() === Number(menit);
  if (!utuh) throw new Error("Tenggat tidak valid.");

  return new Date(utc.getTime() - WIB_OFFSET_MS).toISOString();
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/wib.test.ts`
Expected: PASS, 12 test.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: keluar tanpa output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/time/wib.ts tests/wib.test.ts
git commit -F - <<'MSG'
Tambah modul waktu WIB

Konversi dan format waktu Asia/Jakarta di satu tempat, murni tanpa I/O.
Tanggal yang tidak ada ditolak, bukan digulung diam-diam oleh Date.UTC.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 2: Alihkan seluruh tampilan dan isian waktu ke WIB

Memperbaiki bug yang sudah ada sebelum fitur ini: `formatDate` mengikuti zona waktu server (UTC di hosting), dan tenggat yang diketik tersimpan meleset 7 jam.

**Files:**
- Modify: `src/components/ui.tsx:170-183` (hapus `formatDate`, ganti dengan re-export)
- Modify: `src/app/assignments/[assignmentId]/page.tsx:46-57` (hapus `toLocalInputValue`)
- Modify: `src/lib/actions/assignments.ts:34-42` (hapus badan `optionalDate`)

**Interfaces:**
- Consumes: `formatWib`, `toWibInputValue`, `fromWibInput` dari Task 1.
- Produces: `formatDate` yang diekspor `@/components/ui` kini selalu WIB; seluruh pemanggilnya tidak berubah.

- [ ] **Step 1: Ganti formatDate menjadi re-export**

Di `src/components/ui.tsx`, hapus seluruh fungsi `formatDate` (baris 170-183, termasuk komentar `/** Format tanggal ringkas untuk tabel. */`) dan tambahkan di tempatnya:

```tsx
/**
 * Format tanggal ringkas untuk tabel — selalu WIB.
 *
 * Satu-satunya implementasi ada di @/lib/time/wib; di sini hanya diekspor
 * ulang supaya belasan pemanggil yang sudah ada tidak perlu diubah.
 */
export { formatWib as formatDate } from "@/lib/time/wib";
```

Tambahkan juga impor `formatWib` **tidak diperlukan** — `export { ... } from` sudah menanganinya. Jangan menambahkan impor apa pun untuk ini.

- [ ] **Step 2: Ganti toLocalInputValue di halaman tugas**

Di `src/app/assignments/[assignmentId]/page.tsx`, hapus seluruh fungsi `toLocalInputValue` beserta komentarnya (baris 46-57), lalu tambahkan `toWibInputValue` ke daftar impor di bagian atas berkas:

```tsx
import { toWibInputValue } from "@/lib/time/wib";
```

Ganti satu-satunya pemakaiannya:

```tsx
                <input
                  name="deadline"
                  type="datetime-local"
                  defaultValue={toWibInputValue(assignment.deadline)}
                  className={inputClass}
                />
```

- [ ] **Step 3: Baca isian tenggat sebagai WIB**

Di `src/lib/actions/assignments.ts`, tambahkan impor:

```ts
import { fromWibInput } from "@/lib/time/wib";
```

Ganti fungsi `optionalDate` (baris 34-42) seluruhnya dengan:

```ts
/**
 * Isian <input type="datetime-local"> selalu ditafsirkan sebagai WIB, bukan
 * sebagai zona waktu server. Kosong berarti "tanpa tenggat".
 */
function optionalDate(value: FormDataEntryValue | null): string | null {
  return fromWibInput(String(value ?? ""));
}
```

- [ ] **Step 4: Beri label WIB pada kedua form tenggat**

Di `src/app/assignments/[assignmentId]/page.tsx` ubah `<Field label="Tenggat (opsional)">` menjadi:

```tsx
              <Field label="Tenggat (opsional, WIB)">
```

Di `src/app/courses/[courseId]/assignments/page.tsx` ubah label field tenggat pada form "Tugas Baru" (di sekitar baris 242, field dengan `name="deadline"`) dengan cara yang sama menjadi `label="Tenggat (opsional, WIB)"`.

- [ ] **Step 5: Pastikan tidak ada formatter waktu yang tertinggal**

Run: `grep -rn "toLocaleString\|toLocaleDateString\|toLocalInputValue" src/`
Expected: tepat satu baris, yaitu `toLocaleString` di dalam `src/lib/time/wib.ts`. Bila ada baris lain, alihkan juga ke `formatWib`.

- [ ] **Step 6: Jalankan seluruh test dan typecheck**

Run: `npm test && npm run typecheck`
Expected: seluruh test lulus (belum ada yang berubah perilakunya), typecheck tanpa output.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui.tsx src/app/assignments src/app/courses src/lib/actions/assignments.ts
git commit -F - <<'MSG'
Tampilkan dan baca seluruh waktu dalam WIB

formatDate sebelumnya mengikuti zona waktu server, sehingga di hosting UTC
seluruh waktu tampil meleset 7 jam. Isian tenggat juga ditafsirkan sebagai
waktu server, jadi tenggat yang diketik asisten tersimpan salah.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 3: Skema `assignment_class_settings`

**Files:**
- Create: `supabase/migrations/0004_assignment_class_settings.sql`
- Modify: `src/lib/db/types.ts` (tambah tipe `AssignmentClassSettings` dan entri `Database`)

**Interfaces:**
- Consumes: tidak ada.
- Produces: tipe `AssignmentClassSettings` dengan field `assignment_id: string`, `class_id: string`, `course_id: string`, `deadline: string | null`, `max_attempts: number | null`, `scoring_mode: ScoringMode`, `updated_by: string | null`, `created_at: string`, `updated_at: string`.

- [ ] **Step 1: Tulis migrasi**

Buat `supabase/migrations/0004_assignment_class_settings.sql`:

```sql
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
```

- [ ] **Step 2: Tambahkan tipe TypeScript**

Di `src/lib/db/types.ts`, sisipkan tipe berikut tepat setelah tipe `Assignment` (sebelum `StudentRepository`):

```ts
/**
 * Setelan sebuah tugas untuk SATU kelas.
 *
 * Baris ini ada berarti kelas tersebut sudah disesuaikan asistennya; tidak ada
 * baris berarti kelas mengikuti nilai dasar di tabel assignments. Karena itu
 * `deadline` dan `max_attempts` yang bernilai null di sini berarti benar-benar
 * "tanpa tenggat" / "tanpa batas", bukan "ikut nilai dasar".
 */
export type AssignmentClassSettings = {
  assignment_id: string;
  class_id: string;
  course_id: string;
  deadline: string | null;
  max_attempts: number | null;
  scoring_mode: ScoringMode;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
```

Lalu daftarkan di `Database["public"]["Tables"]`, tepat setelah baris `assignments: Table<Assignment>;`:

```ts
      assignment_class_settings: Table<AssignmentClassSettings>;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: keluar tanpa output.

- [ ] **Step 4: Periksa migrasi bisa dibaca ulang**

Run: `grep -c "create table if not exists\|enable row level security" supabase/migrations/0004_assignment_class_settings.sql`
Expected: `2` — memastikan migrasi idempoten dan RLS aktif, sesuai pola berkas 0001 dan 0002.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_assignment_class_settings.sql src/lib/db/types.ts
git commit -F - <<'MSG'
Tambah tabel setelan tugas per kelas

Ada baris berarti kelas sudah disesuaikan asistennya; tidak ada baris berarti
kelas mengikuti nilai dasar. Dengan begitu "tanpa tenggat" tetap bisa
dibedakan dari "belum pernah disetel".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 4: Resolusi konfigurasi berlaku

**Files:**
- Create: `src/lib/grading/config.ts`
- Test: `tests/assignment-config.test.ts`

**Interfaces:**
- Consumes: tipe `AssignmentClassSettings` dari Task 3.
- Produces:
  - `interface ResolvedAssignmentConfig { deadline: string | null; maxAttempts: number | null; scoringMode: ScoringMode; source: "KELAS" | "DASAR" }`
  - `type AssignmentDefaults = Pick<Assignment, "deadline" | "max_attempts" | "scoring_mode">`
  - `resolveAssignmentConfig(assignment: AssignmentDefaults, override: AssignmentClassSettings | null | undefined): ResolvedAssignmentConfig`
  - `interface StudentClassMembership { course_id: string; class_id: string; created_at: string }`
  - `pickStudentClassId(memberships: StudentClassMembership[], courseId: string): string | null`

- [ ] **Step 1: Tulis test yang gagal**

Buat `tests/assignment-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  pickStudentClassId,
  resolveAssignmentConfig,
  type AssignmentDefaults,
} from "@/lib/grading/config";
import type { AssignmentClassSettings } from "@/lib/db/types";

const dasar: AssignmentDefaults = {
  deadline: "2026-09-07T13:00:00.000Z",
  max_attempts: 3,
  scoring_mode: "BEST",
};

function override(
  patch: Partial<AssignmentClassSettings> = {},
): AssignmentClassSettings {
  return {
    assignment_id: "assignment-1",
    class_id: "class-a",
    course_id: "course-1",
    deadline: "2026-09-08T13:00:00.000Z",
    max_attempts: 1,
    scoring_mode: "FIRST",
    updated_by: "user-asisten",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

describe("resolusi konfigurasi tugas", () => {
  it("memakai nilai dasar bila kelas belum pernah disetel", () => {
    expect(resolveAssignmentConfig(dasar, null)).toEqual({
      deadline: "2026-09-07T13:00:00.000Z",
      maxAttempts: 3,
      scoringMode: "BEST",
      source: "DASAR",
    });
  });

  it("memperlakukan undefined sama dengan belum disetel", () => {
    expect(resolveAssignmentConfig(dasar, undefined).source).toBe("DASAR");
  });

  it("memakai setelan kelas bila barisnya ada", () => {
    expect(resolveAssignmentConfig(dasar, override())).toEqual({
      deadline: "2026-09-08T13:00:00.000Z",
      maxAttempts: 1,
      scoringMode: "FIRST",
      source: "KELAS",
    });
  });

  it("null pada setelan kelas berarti tanpa tenggat, bukan ikut nilai dasar", () => {
    // Inilah alasan resolusinya seluruh-baris, bukan per-field: asisten yang
    // sengaja mengosongkan tenggat kelasnya tidak boleh diam-diam ditarik
    // kembali ke tenggat dasar.
    const hasil = resolveAssignmentConfig(
      dasar,
      override({ deadline: null, max_attempts: null }),
    );
    expect(hasil.deadline).toBeNull();
    expect(hasil.maxAttempts).toBeNull();
    expect(hasil.source).toBe("KELAS");
  });
});

describe("kelas yang berlaku untuk seorang mahasiswa", () => {
  const anggota = (
    classId: string,
    createdAt: string,
    courseId = "course-1",
  ) => ({ course_id: courseId, class_id: classId, created_at: createdAt });

  it("mengembalikan kelas pada course yang diminta", () => {
    const daftar = [
      anggota("class-a", "2026-08-01T00:00:00.000Z"),
      anggota("class-z", "2026-08-01T00:00:00.000Z", "course-lain"),
    ];
    expect(pickStudentClassId(daftar, "course-1")).toBe("class-a");
  });

  it("memilih keanggotaan paling awal bila mahasiswa ada di dua kelas", () => {
    // unique (class_id, user_id) tidak melarang keadaan ini, jadi pilihannya
    // harus dipatok agar nilai yang tampil tidak bergantung pada urutan baris
    // yang dikembalikan database.
    const daftar = [
      anggota("class-b", "2026-08-05T00:00:00.000Z"),
      anggota("class-a", "2026-08-01T00:00:00.000Z"),
    ];
    expect(pickStudentClassId(daftar, "course-1")).toBe("class-a");
  });

  it("memakai class_id terkecil bila waktu bergabungnya sama persis", () => {
    const daftar = [
      anggota("class-c", "2026-08-01T00:00:00.000Z"),
      anggota("class-b", "2026-08-01T00:00:00.000Z"),
    ];
    expect(pickStudentClassId(daftar, "course-1")).toBe("class-b");
  });

  it("mengembalikan null bila mahasiswa tidak terdaftar di course itu", () => {
    expect(pickStudentClassId([], "course-1")).toBeNull();
    expect(
      pickStudentClassId([anggota("class-a", "2026-08-01T00:00:00.000Z")], "course-lain"),
    ).toBeNull();
  });

  it("tidak mengubah urutan array yang diterimanya", () => {
    const daftar = [
      anggota("class-b", "2026-08-05T00:00:00.000Z"),
      anggota("class-a", "2026-08-01T00:00:00.000Z"),
    ];
    pickStudentClassId(daftar, "course-1");
    expect(daftar.map((m) => m.class_id)).toEqual(["class-b", "class-a"]);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/assignment-config.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/grading/config"`.

- [ ] **Step 3: Tulis implementasi**

Buat `src/lib/grading/config.ts`:

```ts
import type {
  Assignment,
  AssignmentClassSettings,
  ScoringMode,
} from "@/lib/db/types";

/**
 * Konfigurasi tugas yang benar-benar berlaku untuk sebuah kelas.
 *
 * Murni tanpa I/O supaya dapat diuji langsung dan dipakai ulang oleh halaman,
 * server action, maupun modul penilaian.
 */

export interface ResolvedAssignmentConfig {
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
  /** Dari mana nilai ini berasal — dipakai UI untuk menampilkan lencana. */
  source: "KELAS" | "DASAR";
}

/** Bagian tabel assignments yang menjadi nilai dasar. */
export type AssignmentDefaults = Pick<
  Assignment,
  "deadline" | "max_attempts" | "scoring_mode"
>;

/**
 * Resolusinya seluruh-baris, bukan per-field.
 *
 * Form asisten menampilkan ketiga field sekaligus, terisi nilai yang sedang
 * berlaku. Kalau disimpan per-field-null, asisten yang hanya bermaksud
 * menggeser tenggat tidak akan sadar bahwa dua field lain masih menempel ke
 * nilai dasar dan bisa berubah kemudian. Dengan seluruh-baris, apa yang
 * dilihat asisten saat menekan simpan itulah yang terkunci untuk kelasnya.
 */
export function resolveAssignmentConfig(
  assignment: AssignmentDefaults,
  override: AssignmentClassSettings | null | undefined,
): ResolvedAssignmentConfig {
  if (override) {
    return {
      deadline: override.deadline,
      maxAttempts: override.max_attempts,
      scoringMode: override.scoring_mode,
      source: "KELAS",
    };
  }

  return {
    deadline: assignment.deadline,
    maxAttempts: assignment.max_attempts,
    scoringMode: assignment.scoring_mode,
    source: "DASAR",
  };
}

export interface StudentClassMembership {
  course_id: string;
  class_id: string;
  created_at: string;
}

/**
 * Kelas mana yang konfigurasinya berlaku untuk seorang mahasiswa pada sebuah
 * course.
 *
 * `unique (class_id, user_id)` di course_members tidak melarang seseorang
 * terdaftar di dua kelas pada course yang sama, meski komentar skema menyebut
 * "tepat satu kelas per course". Supaya nilai yang tampil tidak pernah
 * bergantung pada urutan baris yang kebetulan dikembalikan database,
 * pilihannya dipatok: keanggotaan paling awal, dengan class_id terkecil
 * sebagai pemecah seri.
 */
export function pickStudentClassId(
  memberships: StudentClassMembership[],
  courseId: string,
): string | null {
  const kandidat = memberships
    .filter((m) => m.course_id === courseId)
    .slice()
    .sort((a, b) => {
      const selisih =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return selisih !== 0 ? selisih : a.class_id.localeCompare(b.class_id);
    });

  return kandidat[0]?.class_id ?? null;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/assignment-config.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Typecheck dan seluruh test**

Run: `npm test && npm run typecheck`
Expected: seluruhnya hijau.

- [ ] **Step 6: Commit**

```bash
git add src/lib/grading/config.ts tests/assignment-config.test.ts
git commit -F - <<'MSG'
Resolusi konfigurasi tugas per kelas

Setelan kelas menang seluruh-baris atas nilai dasar, sehingga mengosongkan
tenggat kelas benar-benar berarti tanpa tenggat. Kelas yang berlaku bagi
seorang mahasiswa dipatok deterministik, tidak mengikuti urutan baris database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 5: Kelayakan percobaan di gradebook

Inti fitur. Tenggat dan kuota mulai menyaring nilai yang tampil, tanpa menyentuh satu baris pun di jalur penyimpanan.

**Files:**
- Modify: `src/lib/grading/gradebook.ts` (seluruh berkas)
- Modify: `tests/gradebook.test.ts` (menyesuaikan tanda tangan yang berubah)
- Test: `tests/attempt-eligibility.test.ts`

**Interfaces:**
- Consumes: `ResolvedAssignmentConfig` dari Task 4.
- Produces:
  - `type AttemptExclusion = "BELUM_DINILAI" | "TERLAMBAT" | "LEWAT_KUOTA" | "TERLAMBAT_DAN_LEWAT_KUOTA"`
  - `interface EvaluatedAttempt { submission: Submission; quotaNumber: number | null; late: boolean; overQuota: boolean; eligible: boolean; exclusion: AttemptExclusion | null }`
  - `evaluateAttempts(submissions: Submission[], config: Pick<ResolvedAssignmentConfig, "deadline" | "maxAttempts">): EvaluatedAttempt[]`
  - `summarizeStudent(userId: string, submissions: Submission[], config: ResolvedAssignmentConfig): StudentSummary` — **parameter ketiga berubah** dari `ScoringMode` menjadi objek konfigurasi
  - `summarizeClass(userIds: string[], submissions: Submission[], config: ResolvedAssignmentConfig): StudentSummary[]` — sama
  - `formatScoreTrail(attempts: EvaluatedAttempt[]): string` — **parameter berubah** dari `Submission[]`
  - `StudentSummary` bertambah field `countedAttempts: number`
  - `attemptHistory` dan `SCORING_MODE_LABEL` tidak berubah

- [ ] **Step 1: Tulis test kelayakan yang gagal**

Buat `tests/attempt-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateAttempts, summarizeStudent } from "@/lib/grading/gradebook";
import type { ResolvedAssignmentConfig } from "@/lib/grading/config";
import type { ScoringMode, Submission, SubmissionStatus } from "@/lib/db/types";

let counter = 0;

function submission(
  score: number | null,
  status: SubmissionStatus,
  submittedAt: string,
): Submission {
  counter += 1;
  return {
    id: `sub-${counter}`,
    assignment_id: "assignment-1",
    user_id: "dimas",
    student_repository_id: "repo-1",
    commit_sha: "a".repeat(40),
    workflow_run_id: counter,
    run_attempt: 1,
    status,
    score,
    passed_tests: score,
    total_tests: 100,
    html_url: null,
    raw_result: null,
    submitted_at: submittedAt,
    created_at: submittedAt,
    updated_at: submittedAt,
  };
}

function config(
  patch: Partial<ResolvedAssignmentConfig> = {},
): ResolvedAssignmentConfig {
  return {
    deadline: null,
    maxAttempts: null,
    scoringMode: "BEST" as ScoringMode,
    source: "DASAR",
    ...patch,
  };
}

// Tenggat 20:00 WIB = 13:00 UTC.
const TENGGAT = "2026-09-07T13:00:00.000Z";

describe("kelayakan percobaan", () => {
  it("tanpa tenggat dan tanpa kuota, semua percobaan yang dinilai dihitung", () => {
    const hasil = evaluateAttempts(
      [
        submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
        submission(85, "FAIL", "2026-09-07T12:10:00.000Z"),
      ],
      config(),
    );
    expect(hasil.map((a) => a.eligible)).toEqual([true, true]);
    expect(hasil.map((a) => a.exclusion)).toEqual([null, null]);
  });

  it("menyaring dengan tenggat dan kuota sekaligus", () => {
    // Kuota 1, tenggat 20:00 WIB, mode nilai terbaik.
    const percobaan = [
      submission(60, "FAIL", "2026-09-07T11:30:00.000Z"), // 18:30 WIB
      submission(85, "FAIL", "2026-09-07T12:10:00.000Z"), // 19:10 WIB
      submission(100, "PASS", "2026-09-07T14:00:00.000Z"), // 21:00 WIB
    ];
    const cfg = config({ deadline: TENGGAT, maxAttempts: 1 });

    const hasil = evaluateAttempts(percobaan, cfg);
    expect(hasil.map((a) => a.eligible)).toEqual([true, false, false]);
    expect(hasil.map((a) => a.exclusion)).toEqual([
      null,
      "LEWAT_KUOTA",
      "TERLAMBAT_DAN_LEWAT_KUOTA",
    ]);

    // Nilai terbaik tetap 60 karena 85 dan 100 tidak layak.
    expect(summarizeStudent("dimas", percobaan, cfg).effectiveScore).toBe(60);
  });

  it("percobaan tepat waktu tetap lewat kuota bila kuotanya sudah habis", () => {
    const hasil = evaluateAttempts(
      [
        submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
        submission(85, "FAIL", "2026-09-07T12:10:00.000Z"),
      ],
      config({ deadline: TENGGAT, maxAttempts: 1 }),
    );
    expect(hasil[1].late).toBe(false);
    expect(hasil[1].overQuota).toBe(true);
    expect(hasil[1].exclusion).toBe("LEWAT_KUOTA");
  });

  it("percobaan terlambat ditandai walau kuota masih tersisa", () => {
    const hasil = evaluateAttempts(
      [submission(100, "PASS", "2026-09-07T14:00:00.000Z")],
      config({ deadline: TENGGAT, maxAttempts: 5 }),
    );
    expect(hasil[0].exclusion).toBe("TERLAMBAT");
    expect(hasil[0].overQuota).toBe(false);
  });

  it("tepat pada detik tenggat masih dihitung", () => {
    const hasil = evaluateAttempts(
      [submission(70, "PASS", TENGGAT)],
      config({ deadline: TENGGAT }),
    );
    expect(hasil[0].eligible).toBe(true);
  });

  it("percobaan yang belum dinilai tidak memakan jatah kuota", () => {
    // Push pertama gagal kompilasi tanpa nilai; praktikan dengan kuota 1 tetap
    // punya satu kesempatan sungguhan.
    const percobaan = [
      submission(null, "ERROR", "2026-09-07T11:30:00.000Z"),
      submission(70, "PASS", "2026-09-07T11:45:00.000Z"),
      submission(90, "PASS", "2026-09-07T12:20:00.000Z"),
    ];
    const cfg = config({ maxAttempts: 1, scoringMode: "FIRST" });

    const hasil = evaluateAttempts(percobaan, cfg);
    expect(hasil.map((a) => a.exclusion)).toEqual([
      "BELUM_DINILAI",
      null,
      "LEWAT_KUOTA",
    ]);
    expect(hasil.map((a) => a.quotaNumber)).toEqual([null, 1, 2]);
    expect(summarizeStudent("dimas", percobaan, cfg).effectiveScore).toBe(70);
  });

  it("percobaan yang masih berjalan juga tidak memakan jatah kuota", () => {
    const hasil = evaluateAttempts(
      [
        submission(null, "RUNNING", "2026-09-07T11:30:00.000Z"),
        submission(null, "QUEUED", "2026-09-07T11:31:00.000Z"),
        submission(55, "FAIL", "2026-09-07T11:45:00.000Z"),
      ],
      config({ maxAttempts: 1 }),
    );
    expect(hasil[2].eligible).toBe(true);
    expect(hasil[2].quotaNumber).toBe(1);
  });

  it("ERROR yang punya nilai tetap memakan jatah kuota", () => {
    // Compile error yang tercatat bernilai 0 adalah percobaan yang sudah
    // dinilai, jadi berbeda dari ERROR tanpa nilai.
    const hasil = evaluateAttempts(
      [
        submission(0, "ERROR", "2026-09-07T11:30:00.000Z"),
        submission(90, "PASS", "2026-09-07T11:45:00.000Z"),
      ],
      config({ maxAttempts: 1 }),
    );
    expect(hasil[0].quotaNumber).toBe(1);
    expect(hasil[1].exclusion).toBe("LEWAT_KUOTA");
  });

  it("mengurutkan percobaan dari yang paling lama sebelum menyaring", () => {
    const hasil = evaluateAttempts(
      [
        submission(90, "PASS", "2026-09-07T12:20:00.000Z"),
        submission(70, "PASS", "2026-09-07T11:45:00.000Z"),
      ],
      config({ maxAttempts: 1 }),
    );
    expect(hasil[0].submission.score).toBe(70);
    expect(hasil[0].eligible).toBe(true);
    expect(hasil[1].eligible).toBe(false);
  });

  it("memakai workflow_run_id sebagai pemecah seri saat waktunya sama persis", () => {
    const pertama = submission(70, "PASS", "2026-09-07T11:45:00.000Z");
    const kedua = submission(90, "PASS", "2026-09-07T11:45:00.000Z");
    const hasil = evaluateAttempts([kedua, pertama], config({ maxAttempts: 1 }));
    expect(hasil[0].submission.id).toBe(pertama.id);
  });

  it("tidak mengubah array yang diterimanya", () => {
    const percobaan = [
      submission(90, "PASS", "2026-09-07T12:20:00.000Z"),
      submission(70, "PASS", "2026-09-07T11:45:00.000Z"),
    ];
    const urutanAwal = percobaan.map((s) => s.id);
    evaluateAttempts(percobaan, config());
    expect(percobaan.map((s) => s.id)).toEqual(urutanAwal);
  });

  it("tenggat yang tidak valid diperlakukan sebagai tanpa tenggat", () => {
    // Gagal ke arah aman: lebih baik menghitung percobaan yang meragukan
    // daripada membuang nilai praktikan karena data rusak.
    const hasil = evaluateAttempts(
      [submission(70, "PASS", "2026-09-07T14:00:00.000Z")],
      config({ deadline: "bukan tanggal" }),
    );
    expect(hasil[0].eligible).toBe(true);
  });
});

describe("ringkasan setelah penyaringan", () => {
  const percobaan = [
    submission(60, "FAIL", "2026-09-07T11:30:00.000Z"),
    submission(85, "FAIL", "2026-09-07T12:10:00.000Z"),
    submission(100, "PASS", "2026-09-07T14:00:00.000Z"),
  ];
  const cfg = config({ deadline: TENGGAT, maxAttempts: 1 });

  it("attempts menghitung seluruh push, countedAttempts hanya yang layak", () => {
    const ringkasan = summarizeStudent("dimas", percobaan, cfg);
    expect(ringkasan.attempts).toBe(3);
    expect(ringkasan.countedAttempts).toBe(1);
  });

  it("lastSubmittedAt menunjuk push terakhir apa pun, layak atau tidak", () => {
    // Kolom "Pengumpulan Terakhir" menjawab kapan orang ini terakhir menyentuh
    // tugasnya, bukan kapan nilainya terbentuk.
    expect(summarizeStudent("dimas", percobaan, cfg).lastSubmittedAt).toBe(
      "2026-09-07T14:00:00.000Z",
    );
  });

  it("ketiga nilai dihitung dari himpunan yang layak saja", () => {
    const ringkasan = summarizeStudent("dimas", percobaan, cfg);
    expect(ringkasan.firstScore).toBe(60);
    expect(ringkasan.latestScore).toBe(60);
    expect(ringkasan.bestScore).toBe(60);
  });

  it("tanpa satu pun percobaan yang layak, nilainya null tapi status tetap terlihat", () => {
    const semuaTerlambat = [submission(100, "PASS", "2026-09-07T14:00:00.000Z")];
    const ringkasan = summarizeStudent(
      "dimas",
      semuaTerlambat,
      config({ deadline: TENGGAT }),
    );
    expect(ringkasan.effectiveScore).toBeNull();
    expect(ringkasan.countedAttempts).toBe(0);
    expect(ringkasan.attempts).toBe(1);
    expect(ringkasan.status).toBe("PASS");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/attempt-eligibility.test.ts`
Expected: FAIL — `evaluateAttempts is not exported by "src/lib/grading/gradebook.ts"`.

- [ ] **Step 3: Tulis implementasi**

Ganti isi `src/lib/grading/gradebook.ts` seluruhnya dengan:

```ts
import type {
  ScoringMode,
  Submission,
  SubmissionStatus,
} from "@/lib/db/types";
import type { ResolvedAssignmentConfig } from "@/lib/grading/config";

/**
 * Ringkasan nilai. Murni: menerima daftar submission apa adanya dan menghitung
 * tampilan gradebook.
 *
 * Riwayat tidak pernah dibuang. Tenggat dan kuota percobaan menyaring saat
 * MEMBACA, bukan saat menyimpan — tabel submissions dan jalur webhook tidak
 * tahu-menahu soal keduanya. Konsekuensinya, mengubah tenggat atau kuota
 * sebuah kelas langsung memperbarui nilai yang tampil, termasuk untuk
 * percobaan yang sudah lewat.
 */

export interface StudentSummary {
  userId: string;
  /** SELURUH percobaan, termasuk yang tidak dihitung dan yang belum dinilai. */
  attempts: number;
  /** Percobaan yang lolos tenggat dan kuota. */
  countedAttempts: number;
  /** Nilai dari percobaan LAYAK pertama yang sudah dinilai. */
  firstScore: number | null;
  /** Nilai dari percobaan LAYAK terakhir yang sudah dinilai. */
  latestScore: number | null;
  bestScore: number | null;
  /** Nilai yang berlaku sesuai scoring_mode yang berlaku untuk kelas ini. */
  effectiveScore: number | null;
  /** Percobaan terakhir apa pun, layak atau tidak. */
  lastSubmittedAt: string | null;
  status: SubmissionStatus | "NOT_SUBMITTED";
}

/** Alasan sebuah percobaan tidak masuk hitungan nilai. */
export type AttemptExclusion =
  | "BELUM_DINILAI"
  | "TERLAMBAT"
  | "LEWAT_KUOTA"
  | "TERLAMBAT_DAN_LEWAT_KUOTA";

export interface EvaluatedAttempt {
  submission: Submission;
  /** Nomor urut di antara percobaan yang sudah dinilai; null bila belum. */
  quotaNumber: number | null;
  late: boolean;
  overQuota: boolean;
  eligible: boolean;
  /** null berarti percobaan ini dihitung. */
  exclusion: AttemptExclusion | null;
}

/** Percobaan yang sudah punya nilai (bukan yang masih berjalan). */
function isScored(submission: Submission): boolean {
  return (
    submission.score !== null &&
    (submission.status === "PASS" ||
      submission.status === "FAIL" ||
      submission.status === "ERROR")
  );
}

function byTimeAscending(a: Submission, b: Submission): number {
  const diff =
    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  // Waktu bisa sama persis; run id menjaga urutan tetap stabil.
  return diff !== 0 ? diff : a.workflow_run_id - b.workflow_run_id;
}

/**
 * Menentukan percobaan mana yang masuk hitungan nilai di website.
 *
 * Tiga saringan, atas percobaan yang sudah diurut kronologis:
 *
 *   1. Sudah dinilai. Percobaan QUEUED/RUNNING dan ERROR tanpa nilai dilewati
 *      sepenuhnya dan TIDAK memakan jatah kuota — praktikan berkuota 1 yang
 *      push pertamanya gagal kompilasi tidak kehilangan kesempatannya.
 *   2. Tenggat. submitted_at tidak melewati tenggat kelas.
 *   3. Kuota. Nomor urut di antara percobaan yang sudah dinilai tidak melebihi
 *      kuota kelas. Nomor ini tidak peduli tenggat, jadi push kedua yang masih
 *      tepat waktu tetap lewat kuota bila kuotanya 1.
 *
 * Saringan 2 dan 3 berdiri sendiri; satu percobaan bisa kena keduanya.
 */
export function evaluateAttempts(
  submissions: Submission[],
  config: Pick<ResolvedAssignmentConfig, "deadline" | "maxAttempts">,
): EvaluatedAttempt[] {
  // Tenggat yang tidak terbaca diperlakukan sebagai tanpa tenggat. Gagal ke
  // arah aman: lebih ringan menghitung percobaan yang meragukan daripada
  // membuang nilai praktikan karena data rusak.
  const deadlineMs = config.deadline
    ? new Date(config.deadline).getTime()
    : Number.NaN;
  const adaTenggat = !Number.isNaN(deadlineMs);

  let quotaNumber = 0;

  return submissions
    .slice()
    .sort(byTimeAscending)
    .map((submission): EvaluatedAttempt => {
      if (!isScored(submission)) {
        return {
          submission,
          quotaNumber: null,
          late: false,
          overQuota: false,
          eligible: false,
          exclusion: "BELUM_DINILAI",
        };
      }

      quotaNumber += 1;

      const late =
        adaTenggat &&
        new Date(submission.submitted_at).getTime() > deadlineMs;
      const overQuota =
        config.maxAttempts !== null && quotaNumber > config.maxAttempts;
      const eligible = !late && !overQuota;

      const exclusion: AttemptExclusion | null = eligible
        ? null
        : late && overQuota
          ? "TERLAMBAT_DAN_LEWAT_KUOTA"
          : late
            ? "TERLAMBAT"
            : "LEWAT_KUOTA";

      return { submission, quotaNumber, late, overQuota, eligible, exclusion };
    });
}

export function summarizeStudent(
  userId: string,
  submissions: Submission[],
  config: ResolvedAssignmentConfig,
): StudentSummary {
  const mine = submissions
    .filter((submission) => submission.user_id === userId)
    .sort(byTimeAscending);

  if (mine.length === 0) {
    return {
      userId,
      attempts: 0,
      countedAttempts: 0,
      firstScore: null,
      latestScore: null,
      bestScore: null,
      effectiveScore: null,
      lastSubmittedAt: null,
      status: "NOT_SUBMITTED",
    };
  }

  const nilaiLayak = evaluateAttempts(mine, config)
    .filter((attempt) => attempt.eligible)
    .map((attempt) => attempt.submission.score as number);

  const firstScore = nilaiLayak.length > 0 ? nilaiLayak[0] : null;
  const latestScore =
    nilaiLayak.length > 0 ? nilaiLayak[nilaiLayak.length - 1] : null;
  const bestScore = nilaiLayak.length > 0 ? Math.max(...nilaiLayak) : null;

  const effectiveScore = {
    FIRST: firstScore,
    BEST: bestScore,
    LATEST: latestScore,
  }[config.scoringMode];

  const last = mine[mine.length - 1];

  return {
    userId,
    attempts: mine.length,
    countedAttempts: nilaiLayak.length,
    firstScore,
    latestScore,
    bestScore,
    effectiveScore,
    lastSubmittedAt: last.submitted_at,
    status: last.status,
  };
}

/** Label mode penilaian untuk ditampilkan ke pengguna. */
export const SCORING_MODE_LABEL: Record<ScoringMode, string> = {
  FIRST: "nilai pertama",
  BEST: "nilai terbaik",
  LATEST: "nilai terakhir",
};

/** Label singkat alasan sebuah percobaan tidak dihitung. */
export const ATTEMPT_EXCLUSION_LABEL: Record<AttemptExclusion, string> = {
  BELUM_DINILAI: "belum dinilai",
  TERLAMBAT: "terlambat",
  LEWAT_KUOTA: "lewat kuota",
  TERLAMBAT_DAN_LEWAT_KUOTA: "lewat kuota · terlambat",
};

/** Ringkasan untuk sekumpulan mahasiswa (satu kelas pada satu tugas). */
export function summarizeClass(
  userIds: string[],
  submissions: Submission[],
  config: ResolvedAssignmentConfig,
): StudentSummary[] {
  return userIds.map((userId) =>
    summarizeStudent(userId, submissions, config),
  );
}

/** Riwayat percobaan seorang mahasiswa, terurut lama ke baru. */
export function attemptHistory(
  userId: string,
  submissions: Submission[],
): Submission[] {
  return submissions
    .filter((submission) => submission.user_id === userId)
    .sort(byTimeAscending);
}

/**
 * Contoh tampilan: "60 → (85) → (100)".
 *
 * Percobaan yang tidak dihitung tetap ditampilkan, dalam kurung, supaya
 * praktikan tetap mendapat umpan balik atas latihannya tanpa mengira nilainya
 * berlaku.
 */
export function formatScoreTrail(attempts: EvaluatedAttempt[]): string {
  const bagian = attempts
    .filter((attempt) => attempt.exclusion !== "BELUM_DINILAI")
    .map((attempt) =>
      attempt.eligible
        ? String(attempt.submission.score)
        : `(${attempt.submission.score})`,
    );

  return bagian.length > 0 ? bagian.join(" → ") : "—";
}
```

- [ ] **Step 4: Sesuaikan test gradebook yang sudah ada**

Di `tests/gradebook.test.ts`, tambahkan pembantu `config` tepat setelah fungsi `submission` dan sebelum deklarasi `const dimas`:

```ts
import type { ResolvedAssignmentConfig } from "@/lib/grading/config";
import type { ScoringMode } from "@/lib/db/types";

/** Konfigurasi tanpa tenggat dan tanpa kuota — perilaku sebelum fitur ini. */
function config(scoringMode: ScoringMode): ResolvedAssignmentConfig {
  return { deadline: null, maxAttempts: null, scoringMode, source: "DASAR" };
}
```

Tambahkan `evaluateAttempts` ke daftar impor dari `@/lib/grading/gradebook`.

Lalu ganti setiap pemanggilan yang mengoper mode sebagai string dengan `config(...)`. Daftar lengkapnya — ganti argumen ketiga di setiap baris ini:

- `summarizeStudent("dimas", all, "BEST")` → `summarizeStudent("dimas", all, config("BEST"))`
- `summarizeStudent("budi", all, "BEST")` → `summarizeStudent("budi", all, config("BEST"))`
- `summarizeStudent("budi", all, "LATEST")` → `summarizeStudent("budi", all, config("LATEST"))`
- `summarizeStudent("dimas", all, "LATEST")` → `summarizeStudent("dimas", all, config("LATEST"))`
- `summarizeStudent("dimas", all, "FIRST")` → `summarizeStudent("dimas", all, config("FIRST"))`
- `summarizeStudent("budi", all, "FIRST")` → `summarizeStudent("budi", all, config("FIRST"))`
- `summarizeStudent("eka", eka, "FIRST")` → `summarizeStudent("eka", eka, config("FIRST"))`
- `summarizeStudent("fani", fani, "FIRST")` → `summarizeStudent("fani", fani, config("FIRST"))`
- `summarizeStudent("gani", gani, "FIRST")` → `summarizeStudent("gani", gani, config("FIRST"))`
- `summarizeStudent("andi", all, "BEST")` → `summarizeStudent("andi", all, config("BEST"))`
- `summarizeStudent("citra", running, "LATEST")` → `summarizeStudent("citra", running, config("LATEST"))`
- `summarizeStudent("eka", error, "BEST")` → `summarizeStudent("eka", error, config("BEST"))`
- `summarizeClass(["dimas", "budi", "andi"], all, "BEST")` → `summarizeClass(["dimas", "budi", "andi"], all, config("BEST"))`

Pada test `"mahasiswa tanpa pengumpulan berstatus NOT_SUBMITTED"`, tambahkan `countedAttempts: 0,` ke dalam objek `toMatchObject`.

Ganti kedua pemanggilan `formatScoreTrail`:

```ts
  it("ditampilkan sebagai 40 → 70 → 100", () => {
    const tanpaBatas = { deadline: null, maxAttempts: null };
    expect(
      formatScoreTrail(evaluateAttempts(attemptHistory("dimas", all), tanpaBatas)),
    ).toBe("40 → 70 → 100");
    expect(formatScoreTrail([])).toBe("—");
  });
```

Tambahkan satu test baru di akhir blok `describe("riwayat percobaan", ...)`:

```ts
  it("percobaan yang tidak dihitung ditampilkan dalam kurung", () => {
    expect(
      formatScoreTrail(
        evaluateAttempts(attemptHistory("dimas", all), {
          deadline: null,
          maxAttempts: 1,
        }),
      ),
    ).toBe("40 → (70) → (100)");
  });
```

- [ ] **Step 5: Jalankan kedua berkas test**

Run: `npx vitest run tests/attempt-eligibility.test.ts tests/gradebook.test.ts`
Expected: PASS keduanya.

- [ ] **Step 6: Seluruh test dan typecheck**

Run: `npm test && npm run typecheck`
Expected: `tests/gradebook.test.ts` dan `tests/attempt-eligibility.test.ts` hijau. Typecheck akan **GAGAL** dengan error di `src/lib/views/student-overview.ts` dan `src/app/assignments/[assignmentId]/page.tsx` karena tanda tangan `summarizeStudent`, `summarizeClass`, dan `formatScoreTrail` berubah. Itu diharapkan — Task 9 dan Task 10 yang memperbaikinya. Catat pesan errornya, lanjutkan.

- [ ] **Step 7: Commit**

```bash
git add src/lib/grading/gradebook.ts tests/gradebook.test.ts tests/attempt-eligibility.test.ts
git commit -F - <<'MSG'
Saring nilai dengan tenggat dan kuota percobaan

Tenggat dan percobaan maksimal selama ini hanya ditampilkan, tidak pernah
ditegakkan. Kini keduanya menyaring saat MEMBACA: submission tetap tersimpan
utuh dan tetap terlihat, tetapi yang lewat tenggat atau lewat kuota tidak
masuk hitungan nilai. Percobaan yang belum dinilai tidak memakan jatah kuota.

Jalur webhook dan tabel submissions tidak berubah sama sekali.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 6: Izin asisten menyetel kelasnya

**Files:**
- Modify: `src/lib/auth/policy.ts` (tambah satu predikat di bagian Assignment)
- Modify: `tests/authorization.test.ts`

**Interfaces:**
- Consumes: `isSuperAdmin`, `isAssistantOfClass` yang sudah ada.
- Produces: `canManageClassAssignmentSettings(ctx: AccessContext, classId: string): boolean`

- [ ] **Step 1: Tulis test yang gagal**

Di `tests/authorization.test.ts`, tambahkan `canManageClassAssignmentSettings` ke daftar impor dari `@/lib/auth/policy`, lalu tambahkan blok berikut di akhir berkas:

```ts
describe("setelan tugas per kelas", () => {
  it("SUPER_ADMIN boleh menyetel kelas mana pun", () => {
    expect(canManageClassAssignmentSettings(admin, CLASS_A)).toBe(true);
    expect(canManageClassAssignmentSettings(admin, CLASS_B)).toBe(true);
  });

  it("asisten hanya boleh menyetel kelas yang diasuhnya", () => {
    expect(canManageClassAssignmentSettings(assistantA, CLASS_A)).toBe(true);
    expect(canManageClassAssignmentSettings(assistantA, CLASS_B)).toBe(false);
    expect(canManageClassAssignmentSettings(assistantB, CLASS_B)).toBe(true);
    expect(canManageClassAssignmentSettings(assistantB, CLASS_A)).toBe(false);
  });

  it("satu asisten yang memegang beberapa kelas boleh menyetel semuanya", () => {
    const asistenDuaKelas: AccessContext = {
      user: { id: "user-asisten-x", role: "ASSISTANT" },
      memberships: [
        membership(CLASS_A, "ASSISTANT"),
        membership("class-c", "ASSISTANT"),
      ],
    };
    expect(canManageClassAssignmentSettings(asistenDuaKelas, CLASS_A)).toBe(true);
    expect(canManageClassAssignmentSettings(asistenDuaKelas, "class-c")).toBe(true);
    expect(canManageClassAssignmentSettings(asistenDuaKelas, CLASS_B)).toBe(false);
  });

  it("asisten tanpa kelas tidak boleh menyetel apa pun", () => {
    expect(canManageClassAssignmentSettings(assistantTanpaKelas, CLASS_A)).toBe(
      false,
    );
  });

  it("mahasiswa tidak pernah boleh menyetel kelasnya sendiri", () => {
    const mahasiswa: AccessContext = {
      user: { id: "user-mahasiswa", role: "STUDENT" },
      memberships: [membership(CLASS_A, "STUDENT")],
    };
    expect(canManageClassAssignmentSettings(mahasiswa, CLASS_A)).toBe(false);
  });

  it("nilai dasar tugas tetap hanya milik SUPER_ADMIN", () => {
    // Asisten mendapat setelan per kelas, bukan kendali atas judul, template,
    // nilai maksimal, maupun terbit/tarik.
    expect(canManageAssignment(assistantA)).toBe(false);
    expect(canManageAssignment(admin)).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/authorization.test.ts`
Expected: FAIL — `canManageClassAssignmentSettings is not exported`.

- [ ] **Step 3: Tulis implementasi**

Di `src/lib/auth/policy.ts`, tepat setelah fungsi `canManageAssignment`, tambahkan:

```ts
/**
 * Menyetel tenggat, percobaan maksimal, dan mode penilaian untuk SATU kelas.
 *
 * Sengaja memakai isAssistantOfClass, bukan isAssistantOfCourse: inilah yang
 * membuat asisten Kelas B tidak dapat menyentuh Kelas A, sejalan dengan
 * canManageClassRoster. Satu orang yang memegang beberapa kelas otomatis boleh
 * menyetel semuanya, karena course_members memang membolehkan beberapa baris.
 *
 * Nilai dasar tugas — judul, template, nilai maksimal, terbit/tarik — tetap
 * hanya milik SUPER_ADMIN lewat canManageAssignment.
 */
export function canManageClassAssignmentSettings(
  ctx: AccessContext,
  classId: string,
): boolean {
  return isSuperAdmin(ctx) || isAssistantOfClass(ctx, classId);
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/authorization.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/policy.ts tests/authorization.test.ts
git commit -F - <<'MSG'
Izinkan asisten menyetel tugas untuk kelasnya sendiri

Berbasis keanggotaan kelas, bukan course, sehingga asisten Kelas B tidak dapat
menyentuh Kelas A. Nilai dasar tugas tetap hanya milik SUPER_ADMIN.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 7: Lapisan database setelan kelas

**Files:**
- Create: `src/lib/db/assignment-class-settings.ts`
- Modify: `src/lib/db/courses.ts` (tambah `listStudentClassMemberships`)

**Interfaces:**
- Consumes: tipe `AssignmentClassSettings` (Task 3), tipe `StudentClassMembership` (Task 4).
- Produces:
  - `getClassSettings(assignmentId: string, classId: string): Promise<AssignmentClassSettings | null>`
  - `listClassSettings(assignmentId: string): Promise<AssignmentClassSettings[]>`
  - `listClassSettingsForAssignments(assignmentIds: string[], classIds: string[]): Promise<AssignmentClassSettings[]>`
  - `upsertClassSettings(input: { assignmentId: string; classId: string; courseId: string; deadline: string | null; maxAttempts: number | null; scoringMode: ScoringMode; updatedBy: string }): Promise<void>`
  - `deleteClassSettings(assignmentId: string, classId: string): Promise<void>`
  - `deleteAllClassSettings(assignmentId: string): Promise<void>`
  - `countClassSettings(assignmentId: string): Promise<number>`
  - `listStudentClassMemberships(userId: string): Promise<StudentClassMembership[]>` (di `courses.ts`)

- [ ] **Step 1: Tulis lapisan akses tabel**

Buat `src/lib/db/assignment-class-settings.ts`:

```ts
import "server-only";

import { db } from "@/lib/db/client";
import type { AssignmentClassSettings, ScoringMode } from "@/lib/db/types";

/**
 * Setelan tugas per kelas.
 *
 * Berkas ini hanya melakukan I/O; keputusan "kelas ini ikut nilai dasar atau
 * tidak" ada di resolveAssignmentConfig (src/lib/grading/config.ts), yang murni
 * dan teruji. Di sini, ADA baris berarti kelas sudah disesuaikan.
 */

export async function getClassSettings(
  assignmentId: string,
  classId: string,
): Promise<AssignmentClassSettings | null> {
  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

/** Seluruh kelas yang setelannya sudah disesuaikan pada sebuah tugas. */
export async function listClassSettings(
  assignmentId: string,
): Promise<AssignmentClassSettings[]> {
  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Setelan untuk banyak tugas sekaligus pada kelas-kelas tertentu.
 *
 * Dipakai dasbor mahasiswa dan daftar tugas: satu query untuk seluruh
 * pertemuan, supaya tidak menjadi N+1.
 */
export async function listClassSettingsForAssignments(
  assignmentIds: string[],
  classIds: string[],
): Promise<AssignmentClassSettings[]> {
  if (assignmentIds.length === 0 || classIds.length === 0) return [];

  const { data, error } = await db()
    .from("assignment_class_settings")
    .select("*")
    .in("assignment_id", assignmentIds)
    .in("class_id", classIds);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

export async function upsertClassSettings(input: {
  assignmentId: string;
  classId: string;
  courseId: string;
  deadline: string | null;
  maxAttempts: number | null;
  scoringMode: ScoringMode;
  updatedBy: string;
}): Promise<void> {
  const { error } = await db()
    .from("assignment_class_settings")
    .upsert(
      {
        assignment_id: input.assignmentId,
        class_id: input.classId,
        course_id: input.courseId,
        deadline: input.deadline,
        max_attempts: input.maxAttempts,
        scoring_mode: input.scoringMode,
        updated_by: input.updatedBy,
      },
      { onConflict: "assignment_id,class_id" },
    );
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/** Mengembalikan satu kelas ke nilai dasar. */
export async function deleteClassSettings(
  assignmentId: string,
  classId: string,
): Promise<void> {
  const { error } = await db()
    .from("assignment_class_settings")
    .delete()
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Mengembalikan SELURUH kelas ke nilai dasar.
 *
 * Dipakai tombol "Simpan dan terapkan ke semua kelas" milik admin. Tidak ada
 * nilai yang hilang: yang dihapus hanya setelan, sedangkan submission dan
 * riwayatnya tidak disentuh.
 */
export async function deleteAllClassSettings(
  assignmentId: string,
): Promise<void> {
  const { error } = await db()
    .from("assignment_class_settings")
    .delete()
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/** Berapa kelas yang setelannya akan hilang bila diterapkan ke semua kelas. */
export async function countClassSettings(
  assignmentId: string,
): Promise<number> {
  const { count, error } = await db()
    .from("assignment_class_settings")
    .select("assignment_id", { count: "exact", head: true })
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return count ?? 0;
}
```

- [ ] **Step 2: Tambahkan pembacaan keanggotaan mahasiswa**

Di `src/lib/db/courses.ts`, tambahkan impor tipe:

```ts
import type { StudentClassMembership } from "@/lib/grading/config";
```

Lalu tambahkan fungsi berikut tepat setelah `listMembershipsOf`:

```ts
/**
 * Keanggotaan MAHASISWA seseorang, lengkap dengan waktu bergabung.
 *
 * Berbeda dari listMembershipsOf yang dipakai otorisasi, di sini created_at
 * ikut diambil karena dipakai pickStudentClassId untuk memutuskan kelas mana
 * yang konfigurasinya berlaku bila seseorang terdaftar di dua kelas pada satu
 * course.
 */
export async function listStudentClassMemberships(
  userId: string,
): Promise<StudentClassMembership[]> {
  const { data, error } = await db()
    .from("course_members")
    .select("course_id, class_id, created_at")
    .eq("user_id", userId)
    .eq("role", "STUDENT");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data ?? []) as StudentClassMembership[];
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: hanya error yang tersisa dari Task 5 (`student-overview.ts` dan `assignments/[assignmentId]/page.tsx`). Tidak boleh ada error baru di `assignment-class-settings.ts` atau `courses.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/assignment-class-settings.ts src/lib/db/courses.ts
git commit -F - <<'MSG'
Tambah lapisan akses setelan tugas per kelas

Termasuk pembacaan keanggotaan mahasiswa berikut waktu bergabungnya, yang
dipakai untuk menentukan kelas mana yang konfigurasinya berlaku.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 8: Server action untuk setelan kelas

**Files:**
- Modify: `src/lib/actions/assignments.ts` (tambah dua action, ubah `updateAssignmentAction`)

**Interfaces:**
- Consumes: `canManageClassAssignmentSettings` (Task 6); `upsertClassSettings`, `deleteClassSettings`, `deleteAllClassSettings` (Task 7); `fromWibInput` (Task 1).
- Produces:
  - `updateClassSettingsAction(formData: FormData): Promise<void>` — field form: `assignmentId`, `classId`, `deadline`, `maxAttempts`, `scoringMode`
  - `resetClassSettingsAction(formData: FormData): Promise<void>` — field form: `assignmentId`, `classId`
  - `updateAssignmentAction` menerima field tambahan `applyToAllClasses` bernilai `"1"`

- [ ] **Step 1: Tambahkan impor yang diperlukan**

Di `src/lib/actions/assignments.ts`, tambahkan ke blok impor:

```ts
import { assert, canManageAssignment, canManageClassAssignmentSettings } from "@/lib/auth/policy";
import {
  deleteAllClassSettings,
  deleteClassSettings,
  upsertClassSettings,
} from "@/lib/db/assignment-class-settings";
import { getClass } from "@/lib/db/courses";
```

Baris `import { assert, canManageAssignment } from "@/lib/auth/policy";` yang lama diganti oleh baris pertama di atas — jangan sampai ada dua impor dari modul yang sama.

- [ ] **Step 2: Terapkan "terapkan ke semua kelas" pada update nilai dasar**

Di `updateAssignmentAction`, tepat setelah pemanggilan `await updateAssignment(input.assignmentId, { ... })`, tambahkan:

```ts
    // Dua tombol pada satu form. "Simpan perubahan" membiarkan kelas yang sudah
    // disesuaikan asistennya tidak bergerak; "Simpan dan terapkan ke semua
    // kelas" menghapus seluruh setelan kelas sehingga semuanya kembali ikut
    // nilai dasar. Yang dihapus hanya setelan — submission dan riwayat nilai
    // tidak disentuh.
    if (String(formData.get("applyToAllClasses") ?? "") === "1") {
      await deleteAllClassSettings(input.assignmentId);
    }
```

- [ ] **Step 3: Tambahkan action penyimpan setelan kelas**

Tambahkan di akhir `src/lib/actions/assignments.ts`:

```ts
/**
 * Menyimpan setelan sebuah tugas untuk SATU kelas.
 *
 * Ini satu-satunya jalan asisten mengubah tenggat, kuota percobaan, dan mode
 * penilaian — dan hanya untuk kelas yang benar-benar diasuhnya. Nilai dasar
 * tugas tetap tidak tersentuh.
 */
export async function updateClassSettingsAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({
        assignmentId: uuid,
        classId: uuid,
        scoringMode: z.enum(["BEST", "LATEST", "FIRST"]),
      })
      .parse({
        assignmentId,
        classId,
        scoringMode: formData.get("scoringMode") || "BEST",
      });

    assert(
      canManageClassAssignmentSettings(ctx, input.classId),
      "Anda hanya dapat menyetel kelas yang Anda asuh.",
    );

    const assignment = await getAssignment(input.assignmentId);
    if (!assignment) throw new Error("Tugas tidak ditemukan.");

    // Kelas harus benar-benar milik course tugas ini. Tanpa pemeriksaan ini,
    // pesan yang muncul hanyalah pelanggaran foreign key dari database.
    const klass = await getClass(input.classId);
    if (!klass || klass.course_id !== assignment.course_id) {
      throw new Error("Kelas tersebut bukan bagian dari mata kuliah tugas ini.");
    }

    await upsertClassSettings({
      assignmentId: input.assignmentId,
      classId: input.classId,
      courseId: assignment.course_id,
      deadline: optionalDate(formData.get("deadline")),
      maxAttempts: optionalInt(formData.get("maxAttempts")),
      scoringMode: input.scoringMode,
      updatedBy: ctx.user.id,
    });
  });

  const target = `/assignments/${assignmentId}?classId=${classId}`;
  revalidatePath(`/assignments/${assignmentId}`);
  redirect(withResult(target, message));
}

/** Mengembalikan satu kelas ke nilai dasar yang ditetapkan admin. */
export async function resetClassSettingsAction(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const message = await runAction(async () => {
    const ctx = await requireAccessContext();

    const input = z
      .object({ assignmentId: uuid, classId: uuid })
      .parse({ assignmentId, classId });

    assert(
      canManageClassAssignmentSettings(ctx, input.classId),
      "Anda hanya dapat menyetel kelas yang Anda asuh.",
    );

    await deleteClassSettings(input.assignmentId, input.classId);
  });

  const target = `/assignments/${assignmentId}?classId=${classId}`;
  revalidatePath(`/assignments/${assignmentId}`);
  redirect(withResult(target, message));
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: hanya error tersisa dari Task 5 di `student-overview.ts` dan `assignments/[assignmentId]/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/assignments.ts
git commit -F - <<'MSG'
Tambah server action setelan tugas per kelas

Asisten menyimpan dan mengembalikan setelan kelasnya sendiri; izin diperiksa
per kelas di server, bukan dipercaya dari form. Admin mendapat pilihan
menerapkan nilai dasar ke semua kelas saat menyimpan.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 9: Dasbor mahasiswa memakai konfigurasi kelasnya

Memulihkan typecheck yang sengaja dibiarkan merah sejak Task 5.

**Files:**
- Modify: `src/lib/views/student-overview.ts`
- Modify: `src/app/dashboard/page.tsx:46-53`
- Modify: `src/app/students/[studentId]/page.tsx:52-56,113-121,152-186`

**Interfaces:**
- Consumes: `resolveAssignmentConfig`, `pickStudentClassId` (Task 4); `evaluateAttempts`, `summarizeStudent`, `formatScoreTrail` (Task 5); `listClassSettingsForAssignments`, `listStudentClassMemberships` (Task 7).
- Produces: `StudentAssignmentView` kini berisi `{ assignment, course, repository, summary, attempts: EvaluatedAttempt[], trail, config: ResolvedAssignmentConfig }`. Field `history: Submission[]` **dihapus**, digantikan `attempts`.

- [ ] **Step 1: Tulis ulang student-overview**

Ganti isi `src/lib/views/student-overview.ts` seluruhnya dengan:

```ts
import "server-only";

import { listAssignments } from "@/lib/db/assignments";
import { listClassSettingsForAssignments } from "@/lib/db/assignment-class-settings";
import { listCoursesByIds, listStudentClassMemberships } from "@/lib/db/courses";
import { listRepositoriesForUser } from "@/lib/db/repositories";
import { listSubmissionsForUser } from "@/lib/db/submissions";
import {
  attemptHistory,
  evaluateAttempts,
  formatScoreTrail,
  summarizeStudent,
  type EvaluatedAttempt,
  type StudentSummary,
} from "@/lib/grading/gradebook";
import {
  pickStudentClassId,
  resolveAssignmentConfig,
  type ResolvedAssignmentConfig,
} from "@/lib/grading/config";
import type { Assignment, Course, StudentRepository } from "@/lib/db/types";
import type { AccessContext } from "@/lib/auth/policy";
import { canViewAssignment } from "@/lib/auth/policy";

export interface StudentAssignmentView {
  assignment: Assignment;
  course: Course | undefined;
  repository: StudentRepository | undefined;
  summary: StudentSummary;
  /** Riwayat percobaan lengkap, masing-masing sudah dinilai kelayakannya. */
  attempts: EvaluatedAttempt[];
  trail: string;
  /** Konfigurasi yang berlaku untuk KELAS mahasiswa ini. */
  config: ResolvedAssignmentConfig;
}

/**
 * Menyusun data dasbor seorang mahasiswa.
 *
 * Tenggat, kuota percobaan, dan mode penilaian diambil dari setelan KELAS yang
 * diikuti mahasiswa ini, bukan dari nilai dasar tugas — dua orang pada tugas
 * yang sama bisa punya tenggat berbeda karena kelasnya berbeda.
 *
 * Penyaringan tugas tetap memakai canViewAssignment dari kebijakan terpusat,
 * sehingga tugas yang belum diterbitkan tidak pernah bocor.
 */
export async function buildStudentOverview(params: {
  ctx: AccessContext;
  /** Mahasiswa yang datanya ditampilkan (bisa berbeda dari ctx bagi asisten). */
  userId: string;
  courseIds: string[];
}): Promise<StudentAssignmentView[]> {
  // Kelimanya hanya bergantung pada parameter, tidak saling bergantung, jadi
  // dijalankan dalam satu gelombang.
  const [courses, repositories, submissions, assignmentLists, memberships] =
    await Promise.all([
      listCoursesByIds(params.courseIds),
      listRepositoriesForUser(params.userId),
      listSubmissionsForUser(params.userId),
      Promise.all(
        params.courseIds.map((courseId) => listAssignments(courseId)),
      ),
      listStudentClassMemberships(params.userId),
    ]);

  const assignments = assignmentLists
    .flat()
    .filter((assignment) => canViewAssignment(params.ctx, assignment))
    .sort((a, b) => a.meeting_number - b.meeting_number);

  // Kelas yang berlaku per course, lalu SATU query untuk seluruh setelan kelas
  // yang menyangkut mahasiswa ini — bukan satu query per tugas.
  const classByCourse = new Map<string, string>();
  for (const courseId of params.courseIds) {
    const classId = pickStudentClassId(memberships, courseId);
    if (classId) classByCourse.set(courseId, classId);
  }

  const settings = await listClassSettingsForAssignments(
    assignments.map((assignment) => assignment.id),
    [...classByCourse.values()],
  );

  return assignments.map((assignment) => {
    const history = attemptHistory(params.userId, submissions).filter(
      (submission) => submission.assignment_id === assignment.id,
    );

    const classId = classByCourse.get(assignment.course_id);
    const override =
      settings.find(
        (row) =>
          row.assignment_id === assignment.id && row.class_id === classId,
      ) ?? null;
    const config = resolveAssignmentConfig(assignment, override);

    const attempts = evaluateAttempts(history, config);

    return {
      assignment,
      course: courses.find((course) => course.id === assignment.course_id),
      repository: repositories.find(
        (repository) => repository.assignment_id === assignment.id,
      ),
      summary: summarizeStudent(params.userId, history, config),
      attempts,
      trail: formatScoreTrail(attempts),
      config,
    };
  });
}
```

- [ ] **Step 2: Sesuaikan halaman mahasiswa**

Di `src/app/students/[studentId]/page.tsx`:

Ganti pencarian percobaan terakhir yang dinilai (yang kini memakai `selected.history`):

```tsx
  // Rincian test dari percobaan terakhir yang punya hasil.
  const lastScored = selected?.attempts
    .map((attempt) => attempt.submission)
    .filter((submission) => submission.total_tests !== null)
    .at(-1);
```

Ganti pengecekan riwayat kosong dan perulangannya di dalam `<Card title={`Riwayat — ...`}>`:

```tsx
            {selected.attempts.length === 0 ? (
              <Empty>Belum ada percobaan pengumpulan.</Empty>
            ) : (
              <Table
                head={["#", "Waktu", "Commit", "Status", "Nilai", "Test", ""]}
              >
                {selected.attempts.map((attempt, index) => (
                  <tr key={attempt.submission.id}>
                    <Td className="text-slate-500">{index + 1}</Td>
                    <Td>{formatDate(attempt.submission.submitted_at)}</Td>
                    <Td className="font-mono text-xs">
                      {attempt.submission.commit_sha.slice(0, 7)}
                    </Td>
                    <Td>
                      <Badge value={attempt.submission.status} />
                    </Td>
                    <Td
                      className={
                        attempt.eligible
                          ? "font-medium"
                          : "text-slate-400 line-through"
                      }
                    >
                      {attempt.submission.score ?? "—"}
                    </Td>
                    <Td>
                      {attempt.submission.passed_tests ?? "—"} /{" "}
                      {attempt.submission.total_tests ?? "—"}
                    </Td>
                    <Td>
                      {attempt.submission.html_url && (
                        <a
                          href={attempt.submission.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline"
                        >
                          Log
                        </a>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
```

Pada tabel "Ringkasan Seluruh Tugas", ganti kolom Percobaan agar menunjukkan berapa yang dihitung:

```tsx
                  <Td>
                    {item.summary.attempts}
                    {item.summary.attempts !== item.summary.countedAttempts && (
                      <span className="ml-1 text-xs text-slate-500">
                        ({item.summary.countedAttempts} dihitung)
                      </span>
                    )}
                  </Td>
```

- [ ] **Step 3: Dashboard tidak perlu diubah**

`src/app/dashboard/page.tsx` memanggil `buildStudentOverview` dengan parameter yang sama persis dan hanya meneruskan hasilnya ke `AssignmentCards`. Tidak ada perubahan di berkas ini.

Run: `grep -n "history" src/app/dashboard/page.tsx`
Expected: tidak ada keluaran — memastikan dashboard memang tidak menyentuh field yang dihapus.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: tersisa error hanya di `src/app/assignments/[assignmentId]/page.tsx` (dan `src/components/assignment-cards.tsx` bila sudah menyentuh `config`). Diperbaiki di Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/lib/views/student-overview.ts src/app/students
git commit -F - <<'MSG'
Dasbor mahasiswa memakai konfigurasi kelasnya sendiri

Tenggat, kuota, dan mode penilaian diambil dari setelan kelas yang diikuti
mahasiswa, bukan dari nilai dasar tugas. Percobaan yang tidak dihitung tetap
tampil di riwayat, dicoret, supaya latihannya tetap memberi umpan balik.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

### Task 10: Antarmuka setelan kelas

Task terakhir. Setelah ini typecheck harus kembali bersih.

**Files:**
- Modify: `src/components/assignment-cards.tsx`
- Modify: `src/app/assignments/[assignmentId]/page.tsx`
- Modify: `src/app/courses/[courseId]/assignments/page.tsx`

**Interfaces:**
- Consumes: seluruh Task 1-9.
- Produces: tidak ada API baru; hanya antarmuka.

- [ ] **Step 1: Kartu tugas mahasiswa memakai konfigurasi kelasnya**

Di `src/components/assignment-cards.tsx`, ubah destrukturisasi dan dua baris yang memakai nilai dasar:

```tsx
      {items.map(({ assignment, repository, summary, trail, config }) => (
```

```tsx
            <dt className="text-slate-500">Percobaan</dt>
            <dd className="text-right">
              {summary.attempts}
              {config.maxAttempts ? ` / ${config.maxAttempts}` : ""}
              {summary.attempts !== summary.countedAttempts && (
                <span className="ml-1 text-xs text-slate-500">
                  ({summary.countedAttempts} dihitung)
                </span>
              )}
            </dd>

            <dt className="text-slate-500">Tenggat</dt>
            <dd className="text-right">{formatDate(config.deadline)}</dd>
```

- [ ] **Step 2: Halaman tugas — resolusi konfigurasi kelas terpilih**

Di `src/app/assignments/[assignmentId]/page.tsx`, tambahkan impor:

```tsx
import {
  canManageAssignment,
  canManageClassAssignmentSettings,
  canViewAssignment,
  canViewClass,
  isAssistantOfCourse,
  isSuperAdmin,
} from "@/lib/auth/policy";
import {
  countClassSettings,
  getClassSettings,
} from "@/lib/db/assignment-class-settings";
import { resolveAssignmentConfig } from "@/lib/grading/config";
import {
  ATTEMPT_EXCLUSION_LABEL,
  SCORING_MODE_LABEL,
  evaluateAttempts,
  summarizeClass,
} from "@/lib/grading/gradebook";
import {
  resetClassSettingsAction,
  updateClassSettingsAction,
} from "@/lib/actions/assignments";
```

(Impor `canManageAssignment`, `SCORING_MODE_LABEL`, `summarizeClass` dan kawan-kawan sudah ada — gabungkan, jangan menduplikasi baris impor dari modul yang sama.)

Pada bagian tampilan mahasiswa, ganti pemakaian `view.history` menjadi `view.attempts` dengan pola yang sama seperti pada halaman `/students/[studentId]` di Task 9 Step 2, dan tambahkan label alasan pada baris yang tidak dihitung:

```tsx
                    <Td
                      className={
                        attempt.eligible
                          ? "font-medium"
                          : "text-slate-400 line-through"
                      }
                    >
                      {attempt.submission.score ?? "—"}
                      {attempt.exclusion &&
                        attempt.exclusion !== "BELUM_DINILAI" && (
                          <span className="ml-1 text-xs text-slate-500 no-underline">
                            {ATTEMPT_EXCLUSION_LABEL[attempt.exclusion]}
                          </span>
                        )}
                    </Td>
```

Ganti pengecekan `view.history.length === 0` menjadi `view.attempts.length === 0`, dan perulangan `view.history.map((submission, index) => ...)` menjadi `view.attempts.map((attempt, index) => ...)` dengan seluruh `submission.` di dalamnya menjadi `attempt.submission.`.

- [ ] **Step 3: Gradebook asisten memakai konfigurasi kelas terpilih**

Masih di berkas yang sama, pada bagian tampilan asisten/admin, setelah `selectedClass` ditentukan, ganti blok pengambilan data dan `summarizeClass`:

```tsx
  const members = selectedClass
    ? await listClassMembers(selectedClass.id, "STUDENT")
    : [];
  const userIds = members.map((member) => member.user.id);

  const [submissions, repositories, override, jumlahKelasDisetel] =
    await Promise.all([
      listSubmissions({ assignmentId: assignment.id, userIds }),
      listRepositoriesForAssignment(assignment.id),
      selectedClass
        ? getClassSettings(assignment.id, selectedClass.id)
        : Promise.resolve(null),
      canManage ? countClassSettings(assignment.id) : Promise.resolve(0),
    ]);

  // Konfigurasi yang benar-benar berlaku untuk kelas yang sedang dilihat.
  const config = resolveAssignmentConfig(assignment, override);
  const canManageThisClass =
    selectedClass !== undefined &&
    canManageClassAssignmentSettings(ctx, selectedClass.id);

  const summaries = summarizeClass(userIds, submissions, config);
```

Ganti kolom "Percobaan" pada tabel gradebook:

```tsx
                    <Td>
                      {summary.attempts}
                      {summary.attempts !== summary.countedAttempts && (
                        <span className="ml-1 text-xs text-slate-500">
                          ({summary.countedAttempts} dihitung)
                        </span>
                      )}
                    </Td>
```

- [ ] **Step 4: Tambahkan kartu Setelan Kelas**

Masih di berkas yang sama, sisipkan blok berikut tepat sebelum `{canManage && (` yang membungkus kartu "Ubah Tugas":

```tsx
      {selectedClass && canManageThisClass && (
        <div className="mt-6">
          <Card
            title={`Setelan Kelas — ${selectedClass.name}`}
            action={
              <span className="text-xs text-slate-600">
                {config.source === "KELAS"
                  ? "Disetel untuk kelas ini"
                  : "Mengikuti nilai dasar"}
              </span>
            }
          >
            <p className="mb-3 text-sm text-slate-600">
              Tugas <strong>{assignment.title}</strong> · nilai maksimal{" "}
              {assignment.max_score} · template{" "}
              {template ? `${template.owner}/${template.repo}` : "belum ada"}.
              Ketiganya sama untuk seluruh kelas dan hanya dapat diubah admin.
            </p>

            <form
              action={updateClassSettingsAction}
              className="grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <input type="hidden" name="classId" value={selectedClass.id} />

              <Field
                label="Tenggat (opsional, WIB)"
                hint="Kosongkan untuk kelas tanpa tenggat. Percobaan setelah tenggat tetap tersimpan dan tetap terlihat, tetapi tidak masuk hitungan nilai."
              >
                <input
                  name="deadline"
                  type="datetime-local"
                  defaultValue={toWibInputValue(config.deadline)}
                  className={inputClass}
                />
              </Field>

              <Field
                label="Percobaan maksimal (opsional)"
                hint="Kosongkan untuk tanpa batas. Percobaan yang gagal kompilasi atau masih berjalan tidak memakan jatah."
              >
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  defaultValue={config.maxAttempts ?? ""}
                  className={inputClass}
                  placeholder="tanpa batas"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  label="Mode penilaian"
                  hint="Boleh diubah kapan saja: nilai pertama, terbaik, dan terakhir semuanya tetap tersimpan, jadi berpindah mode tidak menghilangkan riwayat."
                >
                  <select
                    name="scoringMode"
                    defaultValue={config.scoringMode}
                    className={inputClass}
                  >
                    <option value="BEST">Nilai terbaik</option>
                    <option value="LATEST">Nilai terakhir</option>
                    <option value="FIRST">Nilai pertama</option>
                  </select>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Button type="submit">Simpan setelan kelas</Button>
              </div>
            </form>

            {config.source === "KELAS" && (
              <form action={resetClassSettingsAction} className="mt-3">
                <input
                  type="hidden"
                  name="assignmentId"
                  value={assignment.id}
                />
                <input type="hidden" name="classId" value={selectedClass.id} />
                <ConfirmButton
                  variant="secondary"
                  message={`Kembalikan ${selectedClass.name} ke nilai dasar yang ditetapkan admin? Riwayat nilai tidak terhapus.`}
                >
                  Ikuti nilai dasar lagi
                </ConfirmButton>
              </form>
            )}
          </Card>
        </div>
      )}
```

- [ ] **Step 5: Tambahkan tombol "terapkan ke semua kelas" pada form admin**

Masih di berkas yang sama, di dalam kartu "Ubah Tugas", ganti blok tombol simpan:

```tsx
              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <Button type="submit">Simpan perubahan</Button>
                <ConfirmButton
                  variant="secondary"
                  name="applyToAllClasses"
                  value="1"
                  message={
                    jumlahKelasDisetel > 0
                      ? `Setelan pada ${jumlahKelasDisetel} kelas akan dihapus dan semua kelas kembali mengikuti nilai dasar. Riwayat nilai tidak terhapus. Lanjutkan?`
                      : "Belum ada kelas yang disetel terpisah, jadi tidak ada yang hilang. Lanjutkan?"
                  }
                >
                  Simpan dan terapkan ke semua kelas
                </ConfirmButton>
              </div>
```

Tambahkan juga catatan tepat di atas blok tombol tersebut:

```tsx
              <p className="sm:col-span-2 text-xs text-slate-600">
                &quot;Simpan perubahan&quot; tidak menyentuh kelas yang sudah
                disetel asistennya
                {jumlahKelasDisetel > 0 ? ` (${jumlahKelasDisetel} kelas)` : ""}.
              </p>
```

- [ ] **Step 6: Ganti label mode dan tenggat di header halaman**

Masih di berkas yang sama, header memakai nilai dasar. Karena `config` baru tersedia setelah kelas terpilih ditentukan (dan tidak ada bagi mahasiswa), header tetap memakai nilai dasar tetapi diberi keterangan jujur. Ganti bagian `subtitle` pada `PageHeader`:

```tsx
      subtitle={
        <>
          Pertemuan {assignment.meeting_number} · {course?.name ?? ""} · Nilai
          maksimal {assignment.max_score} · Nilai dasar: mode{" "}
          {SCORING_MODE_LABEL[assignment.scoring_mode]}
          {assignment.deadline
            ? ` · tenggat ${formatDate(assignment.deadline)}`
            : ""}
          {" · tiap kelas dapat berbeda"}
        </>
      }
```

- [ ] **Step 7: Daftar tugas menandai kelas yang berbeda**

Di `src/app/courses/[courseId]/assignments/page.tsx`, tambahkan impor:

```tsx
import { listClassSettingsForAssignments } from "@/lib/db/assignment-class-settings";
```

Ganti gelombang query menjadi tiga:

```tsx
  const [allAssignments, templates] = await Promise.all([
    listAssignments(course.id, { includeArchived: canManage }),
    canManage ? listTemplates() : Promise.resolve([]),
  ]);
```

menjadi:

```tsx
  const [allAssignments, templates] = await Promise.all([
    listAssignments(course.id, { includeArchived: canManage }),
    canManage ? listTemplates() : Promise.resolve([]),
  ]);

  // Kelas mana saja yang tenggatnya sudah disetel terpisah, supaya kolom
  // "Tenggat" tidak menyesatkan dengan menampilkan satu angka untuk semua.
  const kelasDisetel = await listClassSettingsForAssignments(
    allAssignments.map((assignment) => assignment.id),
    [...new Set(ctx.memberships.map((m) => m.class_id))],
  );
```

Ganti sel tenggat pada tabel:

```tsx
                  <Td>
                    {formatDate(assignment.deadline)}
                    {kelasDisetel.some(
                      (row) => row.assignment_id === assignment.id,
                    ) && (
                      <span className="ml-1 text-xs text-slate-500">
                        · berbeda per kelas
                      </span>
                    )}
                  </Td>
```

- [ ] **Step 8: Typecheck dan seluruh test harus bersih**

Run: `npm run typecheck && npm test`
Expected: typecheck keluar tanpa output sama sekali (seluruh error dari Task 5 hilang), dan seluruh berkas test lulus.

- [ ] **Step 9: Build produksi**

Run: `npm run build`
Expected: build sukses. Ini menangkap kesalahan yang lolos dari typecheck, misalnya server action yang tidak ditandai `"use server"` atau impor `server-only` yang bocor ke komponen klien.

- [ ] **Step 10: Commit**

```bash
git add src/components/assignment-cards.tsx src/app/assignments src/app/courses
git commit -F - <<'MSG'
Tambah antarmuka setelan tugas per kelas

Asisten mendapat kartu Setelan Kelas pada tab kelas yang diasuhnya, berisi
tenggat, kuota percobaan, dan mode penilaian. Admin mendapat pilihan kedua saat
menyimpan nilai dasar: membiarkan kelas yang sudah disetel, atau menariknya
kembali ke nilai dasar. Percobaan yang tidak dihitung ditampilkan dicoret
beserta alasannya.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Mzp5YW72FoxSv3j1nCRD7G
MSG
```

---

## Setelah Seluruh Task Selesai

Migrasi `0004` belum pernah dijalankan pada database mana pun. Sebelum aplikasi dipakai, jalankan isi `supabase/migrations/0004_assignment_class_settings.sql` di Supabase SQL Editor (atau `supabase db push`). Tanpa itu, setiap halaman tugas akan gagal dengan pesan `Supabase: relation "assignment_class_settings" does not exist`.

Perilaku sebelum ada satu pun setelan kelas: seluruh kelas mengikuti nilai dasar, persis seperti sekarang — kecuali bahwa tenggat dan kuota yang selama ini hanya hiasan kini benar-benar menyaring nilai. **Tugas yang sudah punya `deadline` atau `max_attempts` terisi akan langsung berubah nilainya.** Periksa daftar tugas tersebut lebih dulu:

```sql
select id, meeting_number, title, deadline, max_attempts, scoring_mode
from assignments
where archived_at is null
  and (deadline is not null or max_attempts is not null)
order by meeting_number;
```

Kosongkan kolom yang tidak dimaksudkan sebagai aturan sungguhan sebelum fitur ini dipakai.
