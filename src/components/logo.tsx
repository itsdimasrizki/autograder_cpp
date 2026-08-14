/**
 * Lambang aplikasi: tiga simpul terhubung — linked list, struktur data paling
 * dikenal di praktikum ini.
 *
 * Sengaja SVG inline supaya tidak ada permintaan jaringan tambahan dan
 * warnanya ikut `currentColor`.
 */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Logo Praktikum Struktur Data"
      fill="none"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />

      {/* dua simpul terhubung satu panah — inti linked list */}
      <circle cx="10" cy="16" r="3.6" fill="white" />
      <circle cx="22" cy="16" r="3.6" fill="white" fillOpacity="0.55" />
      <path
        d="M14.2 16h3.4"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.4 14.4 18.2 16l-1.8 1.6"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
