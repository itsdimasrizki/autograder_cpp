"use client";

import type { ReactNode } from "react";

/**
 * Tombol submit dengan dialog konfirmasi bawaan browser.
 *
 * Ini semata lapisan kenyamanan agar aksi destruktif tidak terpencet tanpa
 * sengaja. Otorisasi dan validasi yang sebenarnya tetap dilakukan di server
 * action — membatalkan dialog ini di browser tidak memberi hak apa pun.
 */
export function ConfirmButton({
  children,
  message,
  variant = "danger",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];

  return (
    <button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={`inline-flex items-center rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

/** Kotak teks read-only berisi tautan, plus tombol salin. */
export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800"
      />
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(value)}
        className="shrink-0 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        Salin
      </button>
    </div>
  );
}
