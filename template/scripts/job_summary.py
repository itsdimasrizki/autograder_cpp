#!/usr/bin/env python3
"""Membuat GitHub Job Summary dari result.json.

Ringkasan untuk manusia dibangun dari hasil yang dapat dibaca mesin, bukan
dari parsing teks terminal, sehingga keduanya dijamin konsisten.

Pemakaian:
    python3 scripts/job_summary.py result.json >> "$GITHUB_STEP_SUMMARY"
"""

import json
import sys

ICON = {"PASS": "✅", "FAIL": "❌", "SKIP": "➖", "ERROR": "⚠️"}


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "result.json"

    try:
        with open(path, encoding="utf-8") as handle:
            result = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        print("# Praktikum Struktur Data C++\n")
        print(f"⚠️ Hasil penilaian tidak dapat dibaca: `{error}`")
        return 0

    status = result.get("status", "ERROR")
    score = result.get("score", 0)
    passed = result.get("passed", 0)
    total = result.get("total", 0)

    print("# Praktikum Struktur Data C++\n")
    print("| Parameter | Hasil |")
    print("|---|---:|")
    print(f"| Tests Berhasil | {passed} / {total} |")
    print(f"| Tests Gagal | {max(total - passed, 0)} / {total} |")
    print(f"| Score | **{score} / 100** |")
    print(f"| Status | **{ICON.get(status, '')} {status}** |")

    if result.get("error"):
        print(f"\n> Penyebab: `{result['error']}`")

    tests = result.get("tests", [])
    if tests:
        print("\n## Rincian Test\n")
        print("| Test | Status | Keterangan |")
        print("|---|---|---|")
        for test in tests:
            name = str(test.get("name", "")).replace("|", "\\|")
            message = str(test.get("message", "")).replace("|", "\\|")
            message = message.replace("\n", " ")[:200]
            test_status = test.get("status", "")
            print(
                f"| {name} | {ICON.get(test_status, '')} {test_status} "
                f"| {message} |"
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
