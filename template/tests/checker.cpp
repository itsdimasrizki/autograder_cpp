// =============================================================================
// checker.cpp — Test Harness Instruktur
// =============================================================================
// File ini adalah milik instruktur dan TIDAK boleh diubah mahasiswa.
//
// INSTRUKSI UNTUK INSTRUKTUR:
//   - Tambahkan test case baru dengan memanggil RUN_TEST(nama_test, expr, expected)
//   - Setiap test case harus memanggil fungsi dari student.h
//   - File ini dikompilasi dan di-link bersama student.o, bukan sebaliknya
//   - Untuk setiap pertemuan baru: ganti fungsi di student.h, perbarui test di sini
//
// CATATAN KEAMANAN:
//   Mahasiswa dapat membaca file ini. Mitigasi:
//   - Gunakan input yang bervariasi (bukan hanya satu nilai)
//   - Untuk test sensitif, pertimbangkan menggunakan private repo dengan CI terpisah
// =============================================================================

#include <iostream>
#include <string>
#include <sstream>
#include "report.h"
#include "../src/student.h"

// =============================================================================
// Test Framework (sederhana, tanpa dependency eksternal)
// =============================================================================

// ANSI color codes untuk output terminal yang jelas
#define COLOR_GREEN "\033[32m"
#define COLOR_RED   "\033[31m"
#define COLOR_YELLOW "\033[33m"
#define COLOR_CYAN  "\033[36m"
#define COLOR_RESET "\033[0m"
#define COLOR_BOLD  "\033[1m"

static int total_tests = 0;
static int passed_tests = 0;
static int failed_tests = 0;

// Macro untuk menjalankan satu test case
// Penggunaan: RUN_TEST("nama test", ekspresi_bool, "pesan jika gagal")
#define RUN_TEST(name, condition, msg) do { \
    total_tests++; \
    bool _ok = (condition); \
    std::ostringstream _detail; \
    if (_ok) { \
        passed_tests++; \
        std::cout << COLOR_GREEN << "  [PASS]" << COLOR_RESET \
                  << " " << (name) << std::endl; \
    } else { \
        failed_tests++; \
        _detail << (msg); \
        std::cout << COLOR_RED << "  [FAIL]" << COLOR_RESET \
                  << " " << (name) << std::endl; \
        std::cout << "         Keterangan: " << (msg) << std::endl; \
    } \
    record_test((name), _ok, _detail.str()); \
} while(0)

// Macro untuk test kesetaraan nilai
// Penggunaan: ASSERT_EQ("nama", nilai_aktual, nilai_ekspektasi)
#define ASSERT_EQ(name, actual, expected) do { \
    total_tests++; \
    bool _ok = ((actual) == (expected)); \
    std::ostringstream _detail; \
    if (_ok) { \
        passed_tests++; \
        std::cout << COLOR_GREEN << "  [PASS]" << COLOR_RESET \
                  << " " << (name) << std::endl; \
    } else { \
        failed_tests++; \
        _detail << "Expected: " << (expected) << ", Got: " << (actual); \
        std::cout << COLOR_RED << "  [FAIL]" << COLOR_RESET \
                  << " " << (name) << std::endl; \
        std::cout << "         Expected : " << (expected) << std::endl; \
        std::cout << "         Got      : " << (actual) << std::endl; \
    } \
    record_test((name), _ok, _detail.str()); \
} while(0)

// =============================================================================
// Test Suite
// =============================================================================
// TODO (Instruktur): Ganti test suite di bawah ini sesuai modul pertemuan.
// Ini hanya contoh placeholder untuk demonstrasi sistem.
// =============================================================================

void test_tambah() {
    std::cout << COLOR_CYAN << COLOR_BOLD
              << "\n[TEST SUITE] fungsi tambah()" << COLOR_RESET << std::endl;

    ASSERT_EQ("tambah(2, 3) == 5",      tambah(2, 3),   5);
    ASSERT_EQ("tambah(0, 0) == 0",      tambah(0, 0),   0);
    ASSERT_EQ("tambah(-1, 1) == 0",     tambah(-1, 1),  0);
    ASSERT_EQ("tambah(-5, -3) == -8",   tambah(-5, -3), -8);
    ASSERT_EQ("tambah(100, 200) == 300", tambah(100, 200), 300);
}

void test_is_genap() {
    std::cout << COLOR_CYAN << COLOR_BOLD
              << "\n[TEST SUITE] fungsi isGenap()" << COLOR_RESET << std::endl;

    RUN_TEST("isGenap(4) == true",   isGenap(4) == true,  "4 adalah genap");
    RUN_TEST("isGenap(7) == false",  isGenap(7) == false, "7 adalah ganjil");
    RUN_TEST("isGenap(0) == true",   isGenap(0) == true,  "0 adalah genap");
    RUN_TEST("isGenap(-2) == true",  isGenap(-2) == true, "-2 adalah genap");
    RUN_TEST("isGenap(-3) == false", isGenap(-3) == false,"-3 adalah ganjil");
}

void test_faktorial() {
    std::cout << COLOR_CYAN << COLOR_BOLD
              << "\n[TEST SUITE] fungsi faktorial()" << COLOR_RESET << std::endl;

    ASSERT_EQ("faktorial(0) == 1",   faktorial(0),  1LL);
    ASSERT_EQ("faktorial(1) == 1",   faktorial(1),  1LL);
    ASSERT_EQ("faktorial(5) == 120", faktorial(5),  120LL);
    ASSERT_EQ("faktorial(10) == 3628800", faktorial(10), 3628800LL);
}

// =============================================================================
// Main
// =============================================================================

int main() {
    std::cout << COLOR_BOLD
              << "============================================" << std::endl;
    std::cout << " Praktikum Struktur Data C++ — Auto Checker" << std::endl;
    std::cout << "============================================"
              << COLOR_RESET << std::endl;

    // TODO (Instruktur): Panggil test suite sesuai pertemuan
    test_tambah();
    test_is_genap();
    test_faktorial();

    // -----------------------------------------------------------------------
    // Scoring Summary
    // -----------------------------------------------------------------------
    int score = (total_tests > 0) ? (passed_tests * 100 / total_tests) : 0;

    std::cout << "\n" << COLOR_BOLD
              << "============================================\n"
              << " SCORING SUMMARY\n"
              << "============================================\n"
              << COLOR_RESET;

    std::cout << " Tests Berhasil : " << COLOR_GREEN << COLOR_BOLD
              << passed_tests << COLOR_RESET << " / " << total_tests << "\n";
    std::cout << " Tests Gagal    : " << COLOR_RED << COLOR_BOLD
              << failed_tests << COLOR_RESET << " / " << total_tests << "\n";

    // Score line — warna hijau jika sempurna, kuning jika sebagian, merah jika 0
    std::string score_color = (score == 100) ? COLOR_GREEN
                            : (score > 0)    ? COLOR_YELLOW
                                             : COLOR_RED;
    std::cout << " Score          : " << score_color << COLOR_BOLD
              << score << " / 100" << COLOR_RESET << "\n";

    std::cout << COLOR_BOLD
              << "============================================\n"
              << COLOR_RESET;

    // -----------------------------------------------------------------------
    // Hasil yang dapat dibaca mesin.
    // Berkas inilah yang diunggah sebagai artifact dan dibaca aplikasi web.
    // -----------------------------------------------------------------------
    if (!write_result_json("result.json", score)) {
        std::cerr << "PERINGATAN: gagal menulis result.json" << std::endl;
    }

    if (failed_tests == 0) {
        std::cout << COLOR_GREEN << COLOR_BOLD
                  << " STATUS: SEMUA TEST BERHASIL ✓\n"
                  << COLOR_RESET;
        return 0; // exit code 0 = GitHub Actions SUCCESS
    } else {
        std::cout << COLOR_RED << COLOR_BOLD
                  << " STATUS: " << failed_tests << " TEST GAGAL ✗\n"
                  << COLOR_RESET;
        return 1; // exit code non-zero = GitHub Actions FAIL
    }
}
