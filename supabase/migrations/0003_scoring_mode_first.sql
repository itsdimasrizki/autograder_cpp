-- Mode penilaian "nilai pertama".
--
-- Sebelumnya scoring_mode hanya BEST dan LATEST. FIRST memakai nilai dari
-- percobaan PERTAMA yang sudah dinilai — dipakai bila yang ingin diukur adalah
-- pemahaman saat pertama mencoba, bukan hasil setelah berkali-kali perbaikan.
--
-- Tidak ada data yang berubah: seluruh tugas yang sudah ada tetap pada mode
-- masing-masing. Nilai pertama, terbaik, dan terakhir ketiganya memang selalu
-- dihitung dari riwayat submission, jadi memindahkan mode sebuah tugas bisa
-- dibolak-balik tanpa kehilangan apa pun.
--
-- Catatan: `add value` tidak boleh dipakai di transaksi yang sama dengan
-- pemakaian nilai barunya. Migrasi ini sengaja hanya menambah nilai enum dan
-- tidak menyentuh baris mana pun, jadi aman.

alter type scoring_mode add value if not exists 'FIRST';
