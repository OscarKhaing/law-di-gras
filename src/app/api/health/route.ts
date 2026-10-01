import { errorResponse, ping } from "@/lib/llm";

export const maxDuration = 60;

// Makes a real (tiny) model call, so a 200 here means the key and model both work.
export async function GET() {
  try {
    return Response.json({ ok: true, ...(await ping()) });
  } catch (err) {
    return errorResponse(err);
  }
}
