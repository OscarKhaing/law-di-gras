import { createHash, randomBytes } from "node:crypto";
import { supabase } from "@/server/supabase";
import type { ProviderUpdate, ShareStatus } from "./schema";

// Publishing an update to one provider, and everything the provider's link can do. The link carries
// a random token; only its sha256 is stored, so the table alone cannot open a share.

const LINK_DAYS = 30;

/** 32 random bytes as base64url: 43 characters of [A-Za-z0-9_-]. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Freeze an update and make a link for it. `payload` must already hold only the lines the attorney
 * switched on; `draft` keeps the firm's working copy. Returns the token, which is never stored.
 */
export async function publishShare(input: {
  matterId: number;
  contactRef: string;
  contactName: string;
  draft: unknown;
  payload: Omit<ProviderUpdate, "publishedAt" | "expiresAt">;
}): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const publishedAt = new Date();
  const expiresAt = new Date(publishedAt.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000);
  const payload: ProviderUpdate = {
    ...input.payload,
    publishedAt: publishedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const { data, error } = await supabase()
    .from("shares")
    .insert({
      matter_id: input.matterId,
      contact_ref: input.contactRef,
      contact_name: input.contactName,
      token_hash: hashToken(token),
      draft: input.draft,
      payload,
      published_at: payload.publishedAt,
      expires_at: payload.expiresAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, token, expiresAt: payload.expiresAt };
}

/** The live share behind a link, or null when the token is malformed, unknown, withdrawn or expired. */
export async function shareForToken(token: string): Promise<{ id: string; update: ProviderUpdate } | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await supabase()
    .from("shares")
    .select("id, payload, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at || new Date(data.expires_at as string) <= new Date()) return null;
  return { id: data.id as string, update: data.payload as ProviderUpdate };
}

/** Log that the provider opened their page. A failure is logged, never shown to the provider. */
export async function recordOpen(shareId: string, userAgent: string | null) {
  const { error } = await supabase()
    .from("share_events")
    .insert({ share_id: shareId, kind: "opened", detail: { userAgent } });
  if (error) console.error(`[shares] could not record an open of ${shareId}: ${error.message}`);
}

/** Withdraw a link: the provider's page goes back to "not active" at once. */
export async function withdrawShare(shareId: string) {
  const { error } = await supabase()
    .from("shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .is("revoked_at", null);
  if (error) throw error;
}

type EventRow = { kind: string; detail: { lineId?: string | null; text?: string }; at: string };

/** Every update shared from a case, newest first, with its opens and replies. */
export async function sharesFor(matterId: number): Promise<ShareStatus[]> {
  const { data, error } = await supabase()
    .from("shares")
    .select("id, contact_ref, contact_name, published_at, expires_at, revoked_at, share_events (kind, detail, at)")
    .eq("matter_id", matterId)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const events = (row.share_events as EventRow[]).toSorted((a, b) => b.at.localeCompare(a.at));
    const opens = events.filter((event) => event.kind === "opened");
    return {
      id: row.id as string,
      contactRef: row.contact_ref as string,
      contactName: row.contact_name as string,
      publishedAt: row.published_at as string,
      expiresAt: row.expires_at as string,
      revoked: row.revoked_at !== null,
      opens: opens.length,
      lastOpenedAt: opens[0]?.at ?? null,
      replies: events
        .filter((event) => event.kind === "replied")
        .map((event) => ({ lineId: event.detail.lineId ?? null, text: event.detail.text ?? "", at: event.at })),
    };
  });
}
