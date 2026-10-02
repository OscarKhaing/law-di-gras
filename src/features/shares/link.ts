import { createHash } from "node:crypto";
import { supabase } from "@/server/supabase";
import { LineId, REPLY_LIMIT, ShareToken, type ProviderUpdate, type Reply } from "./schema";

// The provider's side of a shared update, and the permission boundary. Server-only.
// Everything a link can reach is in this file: one share's published update (`payload`) and the
// replies sent through it, found by the SHA-256 hash of the link's token. This file imports nothing
// that can read the case file, the brief or the attorney's draft, and must stay that way: the
// provider's page and the reply route import from here, never from server.ts.

/** A request that cannot be carried out; `status` is the HTTP status to answer with. */
export class ShareError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ShareError";
  }
}

/** The response for a ShareError, in the shape every API error has; null for any other error. */
export function shareErrorResponse(err: unknown): Response | null {
  if (!(err instanceof ShareError)) return null;
  return Response.json({ error: { type: "invalid_request", message: err.message } }, { status: err.status });
}

/** What is stored of a link's token. The token itself is given to the attorney once and never kept. */
export const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

export const asReply = (row: { detail: { lineId?: unknown; text?: unknown } | null; at: string }): Reply => ({
  lineId: typeof row.detail?.lineId === "string" ? row.detail.lineId : null,
  text: typeof row.detail?.text === "string" ? row.detail.text : "",
  at: row.at,
});

/** What an unknown, withdrawn or expired link is told. The same words for all three, and nothing about any case. */
export const NOT_ACTIVE = "This link is no longer active. Ask the law firm that sent it to you for a new one.";

/** The one share a token opens, if it is live: its id and its published update, and no other column. */
async function findLive(token: unknown) {
  if (!ShareToken.safeParse(token).success) return null;
  const { data, error } = await supabase()
    .from("shares")
    .select("id, payload")
    .eq("token_hash", hashOf(token as string))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; payload: ProviderUpdate } | null;
}

/**
 * What a provider's link shows: the published update and the replies already sent through it.
 * Null when the link is unknown, withdrawn or expired. Looking a share up records nothing; the
 * page records the open itself with recordOpen, after it has answered.
 */
export async function getShareByToken(token: string): Promise<{ id: string; update: ProviderUpdate; replies: Reply[] } | null> {
  const share = await findLive(token);
  if (!share) return null;
  const { data, error } = await supabase()
    .from("share_events")
    .select("detail, at")
    .eq("share_id", share.id)
    .eq("kind", "replied")
    .order("at", { ascending: true });
  if (error) throw error;
  return { id: share.id, update: share.payload, replies: (data ?? []).map(asReply) };
}

/** Log that the provider's office opened its page. A failure is logged, never shown to the office. */
export async function recordOpen(shareId: string, userAgent: string | null) {
  const { error } = await supabase()
    .from("share_events")
    .insert({ share_id: shareId, kind: "opened", detail: { userAgent } });
  if (error) console.error(`[shares] could not record an open of ${shareId}: ${error.message}`);
}

/** Store what a provider's office wrote back to one line of its update. Nothing is written to Clio. */
export async function replyToShare(token: unknown, lineId: unknown, text: unknown): Promise<{ at: string }> {
  // The link is checked before anything else, so a dead or made-up link learns nothing from the answer.
  const share = await findLive(token);
  if (!share) throw new ShareError(NOT_ACTIVE, 410);
  if (!LineId.safeParse(lineId).success || !share.payload.lines.some((line) => line.id === lineId)) {
    throw new ShareError("That line is no longer part of this update. Reload the page.", 409);
  }
  const message = typeof text === "string" ? text.trim() : "";
  if (!message) throw new ShareError("Write a reply before sending.");
  if (message.length > REPLY_LIMIT) throw new ShareError(`A reply can be at most ${REPLY_LIMIT.toLocaleString("en-US")} characters.`);
  const { data, error } = await supabase()
    .from("share_events")
    .insert({ share_id: share.id, kind: "replied", detail: { lineId, text: message } })
    .select("at")
    .single();
  if (error) throw error;
  return { at: data.at as string };
}
