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
