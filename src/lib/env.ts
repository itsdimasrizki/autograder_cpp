/**
 * Akses environment variable terpusat.
 *
 * Semua nilai di sini HANYA boleh dibaca dari kode server (route handler,
 * server component, server action). Tidak ada yang berawalan NEXT_PUBLIC_
 * kecuali yang memang aman untuk browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} belum diset. Lihat .env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // --- Supabase -------------------------------------------------------------
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  /** Service role: server-side saja, JANGAN pernah dikirim ke browser. */
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },

  // --- Sesi -----------------------------------------------------------------
  /** Kunci HMAC untuk menandatangani cookie sesi. Minimal 32 karakter. */
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET minimal 32 karakter.");
    }
    return secret;
  },

  // --- GitHub OAuth (login) -------------------------------------------------
  get githubOAuthClientId() {
    return required("GITHUB_OAUTH_CLIENT_ID");
  },
  get githubOAuthClientSecret() {
    return required("GITHUB_OAUTH_CLIENT_SECRET");
  },

  // --- GitHub App (operasi repository) --------------------------------------
  get githubAppId() {
    return required("GITHUB_APP_ID");
  },
  get githubAppPrivateKey() {
    // Vercel menyimpan newline sebagai "\n" literal — kembalikan ke newline asli.
    return required("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  },
  get githubAppInstallationId() {
    return required("GITHUB_APP_INSTALLATION_ID");
  },
  get githubWebhookSecret() {
    return required("GITHUB_WEBHOOK_SECRET");
  },
  /** Organisasi GitHub tempat repository mahasiswa dibuat. */
  get githubOrg() {
    return required("GITHUB_ORG");
  },

  // --- Bootstrap ------------------------------------------------------------
  /**
   * Daftar username GitHub (dipisah koma) yang otomatis menjadi SUPER_ADMIN
   * saat pertama kali login. Ini satu-satunya cara mendapatkan admin pertama;
   * browser tidak pernah bisa menaikkan role-nya sendiri.
   */
  get superAdmins(): string[] {
    return (optional("GITHUB_SUPER_ADMINS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },

  get appUrl() {
    return optional("APP_URL") ?? "http://localhost:3000";
  },

  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
