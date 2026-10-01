import { supabase } from "@/lib/supabase";

// Lists storage buckets: a real Supabase round trip that works before any tables exist.
export async function GET() {
  try {
    const { data, error } = await supabase().storage.listBuckets();
    if (error) throw error;
    return Response.json({ ok: true, buckets: data.map((bucket) => bucket.name) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[supabase] ${message}`);
    return Response.json({ error: { type: "supabase_error", message } }, { status: 500 });
  }
}
