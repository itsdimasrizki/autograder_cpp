import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/**
 * Klien Supabase dengan SERVICE ROLE key.
 *
 * RLS di-bypass, jadi SETIAP pemanggilan harus lewat pengecekan otorisasi di
 * src/lib/auth/authorize.ts terlebih dahulu. Modul ini memakai "server-only"
 * sehingga build akan gagal kalau tidak sengaja diimpor dari komponen client.
 */
export function db(): Db {
  if (!cached) {
    cached = createClient<Database>(
      env.supabaseUrl,
      env.supabaseServiceRoleKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-application-name": "web-strukdat" } },
      },
    );
  }
  return cached;
}

/** Melempar error kalau query Supabase gagal, supaya tidak ada kegagalan senyap. */
export function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error) throw new Error(`Supabase: ${result.error.message}`);
  if (result.data === null) throw new Error("Supabase: data kosong.");
  return result.data;
}
