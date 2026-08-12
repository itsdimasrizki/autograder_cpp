import { inflateRawSync } from "node:zlib";

/**
 * Pembaca ZIP minimal — cukup untuk mengambil satu berkas dari artifact
 * GitHub Actions (artifact selalu diunduh dalam bentuk zip).
 *
 * Sengaja tidak memakai pustaka pihak ketiga: yang dibutuhkan hanya membaca
 * satu berkas kecil dengan metode "stored" atau "deflate".
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

interface CentralEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** Menemukan End of Central Directory, mundur dari akhir berkas. */
function findEndOfCentralDirectory(buffer: Buffer): number {
  // Comment maksimal 65535 byte + 22 byte struktur EOCD.
  const start = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= start; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new ZipError("Bukan berkas ZIP yang valid (EOCD tidak ditemukan).");
}

function readCentralDirectory(buffer: Buffer): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  if (offset === 0xffffffff) {
    throw new ZipError("Arsip ZIP64 tidak didukung.");
  }

  const entries: CentralEntry[] = [];

  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > buffer.length) {
      throw new ZipError("Central directory ZIP rusak.");
    }
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ZipError("Tanda tangan central directory ZIP tidak cocok.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntryData(buffer: Buffer, entry: CentralEntry): Buffer {
  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.length) {
    throw new ZipError("Local header ZIP rusak.");
  }
  if (buffer.readUInt32LE(header) !== LOCAL_SIGNATURE) {
    throw new ZipError("Tanda tangan local header ZIP tidak cocok.");
  }

  // Panjang nama/extra pada local header bisa berbeda dari central directory.
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(data);
  if (entry.compressionMethod === 8) return inflateRawSync(data);

  throw new ZipError(
    `Metode kompresi ZIP tidak didukung: ${entry.compressionMethod}.`,
  );
}

/** Daftar nama berkas di dalam arsip. */
export function listZipEntries(buffer: Buffer): string[] {
  return readCentralDirectory(buffer).map((entry) => entry.fileName);
}

/**
 * Mengambil satu berkas dari arsip berdasarkan nama (mengabaikan direktori
 * induk), atau null bila tidak ada.
 */
export function readZipFile(buffer: Buffer, fileName: string): Buffer | null {
  const entries = readCentralDirectory(buffer);
  const entry =
    entries.find((candidate) => candidate.fileName === fileName) ??
    entries.find(
      (candidate) => candidate.fileName.split("/").pop() === fileName,
    );
  if (!entry) return null;
  return readEntryData(buffer, entry);
}
