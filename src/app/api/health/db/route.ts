import { errorResponse } from "@/server/http";
import { supabase } from "@/server/supabase";

// Lists storage buckets: a real Supabase round trip that works before any tables exist.
export async function GET() {
  try {
    const { data, error } = await supabase().storage.listBuckets();
    if (error) throw error;
    return Response.json({ ok: true, buckets: data.map((bucket) => bucket.name) });
  } catch (err) {
    return errorResponse(err);
  }
}
