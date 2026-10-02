import { createHash, randomBytes } from "node:crypto";
import { supabase } from "@/server/supabase";
import {
  FILE_KINDS,
  FILE_KINDS_SAID,
  FILE_MAX_BYTES,
  FILE_MAX_MB,
  FILES_PER_SHARE,
  LineId,
  REPLY_LIMIT,
  ShareToken,
  type ProviderUpdate,
  type ReceivedFile,
  type Reply,
  type SentFile,
} from "./schema";

// The provider's side of a shared update, and the permission boundary. Server-only.
// Everything a link can reach is in this file: one share's published update (`payload`), the
// replies sent through it and the files attached to them (kept in that share's own folder of our
// private storage), found by the SHA-256 hash of the link's token. This file imports nothing
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

type FileDetail = { lineId?: unknown; name?: unknown; path?: unknown; bytes?: unknown };

export const asFile = (row: { detail: FileDetail | null; at: string }): ReceivedFile => ({
  lineId: typeof row.detail?.lineId === "string" ? row.detail.lineId : null,
  name: typeof row.detail?.name === "string" ? row.detail.name : "",
  bytes: typeof row.detail?.bytes === "number" ? row.detail.bytes : 0,
  path: typeof row.detail?.path === "string" ? row.detail.path : "",
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
 * What a provider's link shows: the published update, and the replies and files already sent
 * through it. Null when the link is unknown, withdrawn or expired. Looking a share up records
 * nothing; the page records the open itself with recordOpen, after it has answered.
 */
export async function getShareByToken(
  token: string,
): Promise<{ id: string; update: ProviderUpdate; replies: Reply[]; files: SentFile[] } | null> {
  const share = await findLive(token);
  if (!share) return null;
  const { data, error } = await supabase()
    .from("share_events")
    .select("kind, detail, at")
    .eq("share_id", share.id)
    .in("kind", ["replied", "uploaded"])
    .order("at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  return {
    id: share.id,
    update: share.payload,
    replies: rows.filter((row) => row.kind === "replied").map(asReply),
    // The office's page is told a file's name and size, never where it is kept.
    files: rows
      .filter((row) => row.kind === "uploaded")
      .map(asFile)
      .map(({ lineId, name, bytes, at }) => ({ lineId, name, bytes, at })),
  };
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
  const share = await liveLine(token, lineId);
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

// ---- Files attached to a reply ----
// A file goes from the office's browser straight to our private storage through a one-time upload
// address, never through this app's routes. It is asked for (startUpload), sent by the browser, and
// then confirmed (finishUpload), which is when it is checked and the firm is told. Nothing reaches Clio.

/** The private Storage bucket the app keeps files in. */
const BUCKET = "documents";

/**
 * Whether `path` may be handed to Storage. The same rule as the documents bucket's own check,
 * copied so that this file imports nothing from the case's side: every segment starts with a
 * letter, digit, underscore or dash, which rules out "..", "?" and "%".
 */
const isStoragePath = (path: string) => /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(path);

/** The one folder a share's files are kept in. */
const folderOf = (shareId: string) => `shares/${shareId}`;

/**
 * The name a file was sent under when `path` is a file in this share's own folder, otherwise null.
 * Every path that comes from a request passes through here before it reaches Storage.
 */
export function nameInShare(shareId: string, path: unknown): string | null {
  if (typeof path !== "string" || path.length > 300 || !isStoragePath(path)) return null;
  const folder = `${folderOf(shareId)}/`;
  if (!path.startsWith(folder)) return null;
  return /^[0-9a-f]{16}-([A-Za-z0-9_][A-Za-z0-9_.-]*)$/.exec(path.slice(folder.length))?.[1] ?? null;
}

const ENDINGS: Record<string, string[]> = { "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"] };

/** A file name made safe to be part of a path: plain letters, digits, dashes and underscores, and an ending that matches its kind. */
function safeName(fileName: unknown, type: string) {
  const last = (typeof fileName === "string" ? fileName : "").split(/[\\/]/).pop() ?? "";
  const dot = last.lastIndexOf(".");
  const stem = (dot > 0 ? last.slice(0, dot) : last)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|-+$/g, "")
    .slice(0, 80);
  const said = dot > 0 ? last.slice(dot + 1).toLowerCase() : "";
  return `${stem || "file"}.${ENDINGS[type].includes(said) ? said : ENDINGS[type][0]}`;
}

/** What the first bytes of a file say it is, whatever it was sent as. */
function kindOf(head: Uint8Array) {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  return "";
}

/** The live share and the line a file is for, checked in the same order as a reply: the link first. */
async function liveLine(token: unknown, lineId: unknown) {
  const share = await findLive(token);
  if (!share) throw new ShareError(NOT_ACTIVE, 410);
  if (!LineId.safeParse(lineId).success || !share.payload.lines.some((line) => line.id === lineId)) {
    throw new ShareError("That line is no longer part of this update. Reload the page.", 409);
  }
  return share;
}

const TOO_MANY = `This link has taken its ${FILES_PER_SHARE} files. Send the rest to the firm directly.`;
const TOO_LARGE = `A file can be at most ${FILE_MAX_MB} MB. Send it in smaller parts.`;
const WRONG_KIND = `Only a ${FILE_KINDS_SAID} file can be attached. Save or scan it as a PDF and attach that.`;

/**
 * Give a provider's office a one-time address to send one file to, for one line of its update.
 * The kind, the size and the number of files already in the share's folder are checked here, and
 * checked again against the file itself in finishUpload.
 */
export async function startUpload(
  token: unknown,
  lineId: unknown,
  fileName: unknown,
  type: unknown,
  size: unknown,
): Promise<{ url: string; path: string }> {
  const share = await liveLine(token, lineId);
  if (typeof type !== "string" || !Object.hasOwn(FILE_KINDS, type)) throw new ShareError(WRONG_KIND, 415);
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) throw new ShareError("That file is empty. Choose another.");
  if (size > FILE_MAX_BYTES) throw new ShareError(TOO_LARGE, 413);

  const storage = supabase().storage.from(BUCKET);
  // Counted in the folder itself, so a file that was sent but never confirmed still counts.
  const { data: held, error: unlisted } = await storage.list(folderOf(share.id), { limit: 100 });
  if (unlisted) throw unlisted;
  const count = (held ?? []).filter((object) => nameInShare(share.id, `${folderOf(share.id)}/${object.name}`) !== null).length;
  if (count >= FILES_PER_SHARE) throw new ShareError(TOO_MANY, 409);

  const path = `${folderOf(share.id)}/${randomBytes(8).toString("hex")}-${safeName(fileName, type)}`;
  if (nameInShare(share.id, path) === null) throw new ShareError("That file name cannot be used. Rename the file and attach it again.");
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error) throw error;
  return { url: data.signedUrl, path };
}

/**
 * Confirm a file the office's browser has sent, and tell the firm. The path must be in this share's
 * own folder and the file must be there; its real size, its first bytes and the kind it was stored
 * under are checked, and a file that fails is deleted. Confirming the same file twice records it once.
 */
export async function finishUpload(token: unknown, lineId: unknown, path: unknown): Promise<SentFile> {
  const share = await liveLine(token, lineId);
  const name = nameInShare(share.id, path);
  if (name === null) throw new ShareError("That file is not part of this update. Attach it again.");
  const kept = path as string;

  const storage = supabase().storage.from(BUCKET);
  const { data: info, error: missing } = await storage.info(kept);
  if (missing || !info) throw new ShareError("The file did not arrive. Attach it again.", 409);
  const refuse = async (message: string, status: number): Promise<never> => {
    const { error } = await storage.remove([kept]);
    if (error) console.error(`[shares] could not delete a refused file of ${share.id}: ${error.message}`);
    throw new ShareError(message, status);
  };
  const bytes = info.size ?? 0;
  if (bytes <= 0) return refuse("That file is empty. Choose another.", 400);
  if (bytes > FILE_MAX_BYTES) return refuse(TOO_LARGE, 413);
  const { data: link, error: unsigned } = await storage.createSignedUrl(kept, 60);
  if (unsigned) throw unsigned;
  const first = await fetch(link.signedUrl, { headers: { Range: "bytes=0-7" } });
  if (!first.ok) throw new Error(`Could not read a file sent to ${share.id}: ${first.status}`);
  // The kind the file was stored under is the kind it is opened as at the firm, and the office's
  // browser chose it when sending. It must be the kind the bytes themselves say.
  const kind = kindOf(new Uint8Array(await first.arrayBuffer()));
  if (!Object.hasOwn(FILE_KINDS, kind) || info.contentType !== kind) return refuse(WRONG_KIND, 415);

  const { data: rows, error: unread } = await supabase()
    .from("share_events")
    .select("detail, at")
    .eq("share_id", share.id)
    .eq("kind", "uploaded");
  if (unread) throw unread;
  const recorded = (rows ?? []).map(asFile);
  const already = recorded.find((file) => file.path === kept);
  if (already) return { lineId: already.lineId, name: already.name, bytes: already.bytes, at: already.at };
  if (recorded.length >= FILES_PER_SHARE) return refuse(TOO_MANY, 409);

  const { data, error } = await supabase()
    .from("share_events")
    .insert({ share_id: share.id, kind: "uploaded", detail: { lineId, name, path: kept, bytes } })
    .select("at")
    .single();
  if (error) throw error;
  return { lineId: lineId as string, name, bytes, at: data.at as string };
}
