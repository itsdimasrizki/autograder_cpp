// =============================================================================
// student.cpp — Implementasi Mahasiswa
// =============================================================================
// INSTRUKSI:
//   - Hanya edit file ini untuk mengerjakan soal praktikum.
//   - Jangan menghapus atau mengubah #include "student.h" di baris pertama.
//   - Jangan mengubah nama atau signature fungsi.
//   - Anda boleh menambahkan fungsi helper, struct, atau class tambahan.
//   - JANGAN menambahkan fungsi main() di file ini.
//
// FILE YANG BOLEH DIEDIT : src/student.cpp  ← HANYA FILE INI
// FILE YANG TIDAK BOLEH DIEDIT: src/student.h, tests/checker.cpp
// =============================================================================

#include "student.h"

// =============================================================================
// TODO (Mahasiswa): Implementasikan fungsi-fungsi di bawah ini.
// =============================================================================

// [PLACEHOLDER] Implementasi fungsi tambah
// TODO: Ganti dengan implementasi sesuai modul pertemuan
int tambah(int a, int b) {
    // Hapus baris ini dan tulis implementasi Anda:
    return a + b; // <-- implementasi contoh (sudah benar)
}

// [PLACEHOLDER] Implementasi fungsi isGenap
// TODO: Ganti dengan implementasi sesuai modul pertemuan
bool isGenap(int n) {
    // Hapus baris ini dan tulis implementasi Anda:
    return n % 2 == 0; // <-- implementasi contoh (sudah benar)
}

// [PLACEHOLDER] Implementasi fungsi faktorial
// TODO: Ganti dengan implementasi sesuai modul pertemuan
long long faktorial(int n) {
    // Hapus baris ini dan tulis implementasi Anda:
    if (n <= 1) return 1;
    return n * faktorial(n - 1); // <-- implementasi contoh (sudah benar)
}
