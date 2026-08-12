import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Praktikum Struktur Data",
  description: "Manajemen tugas praktikum C++ dengan penilaian otomatis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
