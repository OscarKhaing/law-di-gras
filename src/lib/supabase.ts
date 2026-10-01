import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Server-side Supabase client (Postgres + Storage). Use from route handlers only. */
export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are not set. Add them to .env.local.");
  }
  return (client ??= createClient(url, key, { auth: { persistSession: false } }));
}
