import { z } from "zod";
import { errorResponse, parseJson } from "@/server/http";
import { complete } from "@/server/llm";

export const maxDuration = 300;

const Body = z.object({
  prompt: z.string().min(1),
  system: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await parseJson(request, Body);
  if ("response" in body) return body.response;
  try {
    return Response.json(await complete(body.data));
  } catch (err) {
    return errorResponse(err);
  }
}
