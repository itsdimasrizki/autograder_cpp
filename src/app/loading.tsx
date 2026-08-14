/**
 * Kerangka halaman yang langsung tampil saat berpindah halaman.
 *
 * Semua halaman aplikasi ini `force-dynamic`, sehingga Next harus menunggu
 * seluruh query selesai sebelum mengirim HTML. Tanpa berkas ini browser diam
 * total setelah tautan diklik dan terasa macet. Dengan Suspense boundary di
 * sini, kerangka di bawah dikirim seketika lalu diganti isi sebenarnya.
 *
 * Berlaku untuk seluruh route yang tidak punya loading.tsx sendiri.
 */
export default function Loading() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-x-6 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">
            Praktikum Struktur Data
          </span>
          <span className="text-sm text-slate-400">Memuat…</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="animate-pulse space-y-6">
          <div className="space-y-2">
            <div className="h-6 w-64 rounded bg-slate-200" />
            <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
          </div>

          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="h-4 w-40 rounded bg-slate-200" />
              </div>
              <div className="space-y-3 p-4">
                <div className="h-4 w-full rounded bg-slate-100" />
                <div className="h-4 w-5/6 rounded bg-slate-100" />
                <div className="h-4 w-4/6 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
