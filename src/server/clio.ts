import { supabase } from "@/server/supabase";

// The only file that talks to Clio Manage (API v4, US region). It reads and never writes: the only
// requests it can make to the API are GETs. The OAuth tokens are kept in Supabase, in the single
// row of `clio_connection`, so every environment shares one connection.

const ORIGIN = "https://app.clio.com";
const API = `${ORIGIN}/api/v4`;

export class ClioError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ClioError";
  }
}

function credentials() {
  const id = process.env.CLIO_CLIENT_ID;
  const secret = process.env.CLIO_CLIENT_SECRET;
  if (!id || !secret) {
    throw new ClioError("CLIO_CLIENT_ID and CLIO_CLIENT_SECRET are not set. Add them to .env.local.", 500);
  }
  return { id, secret };
}

/**
 * The address Clio sends the browser back to. Built from the Host header, because in development
 * `request.url` says "localhost" even when the page was opened at 127.0.0.1, and Clio only accepts
 * the exact address registered on the developer app.
 */
export function callbackUrl(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/clio/callback`;
}

/** Where to send the browser so the firm can allow Case Desk to read its Clio account. */
export function authorizeUrl(redirectUri: string, state: string) {
  const url = new URL(`${ORIGIN}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", credentials().id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenReply = { access_token: string; refresh_token?: string; expires_in: number };

async function requestToken(grant: Record<string, string>): Promise<TokenReply> {
  const { id, secret } = credentials();
  const res = await fetch(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...grant }),
    cache: "no-store",
  });
  if (!res.ok) throw new ClioError(`Clio refused the connection (${res.status}): ${await res.text()}`, 502);
  return (await res.json()) as TokenReply;
}

async function saveTokens(reply: TokenReply, keepRefreshToken?: string) {
  const { error } = await supabase()
    .from("clio_connection")
    .upsert({
      id: 1,
      access_token: reply.access_token,
      // A refresh does not return a new refresh token; the old one stays valid.
      refresh_token: reply.refresh_token ?? keepRefreshToken ?? null,
      expires_at: new Date(Date.now() + reply.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

/** Finish the OAuth flow: trade the code Clio sent back for tokens and store them. */
export async function exchangeCode(code: string, redirectUri: string) {
  await saveTokens(await requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri }));
}

/** Whether a Clio account has been connected. */
export async function isConnected(): Promise<boolean> {
  const { data, error } = await supabase().from("clio_connection").select("id").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function accessToken(forceRefresh = false): Promise<string> {
  const { data, error } = await supabase()
    .from("clio_connection")
    .select("access_token, refresh_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ClioError("Clio is not connected yet. Connect it from the case list.", 409);
  const fresh = new Date(data.expires_at).getTime() - Date.now() > 5 * 60_000;
  if (fresh && !forceRefresh) return data.access_token;
  if (!data.refresh_token) throw new ClioError("The Clio connection has expired. Connect it again.", 409);
  const reply = await requestToken({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await saveTokens(reply, data.refresh_token);
  return reply.access_token;
}

export type ClioParams = Record<string, string | number | boolean | undefined>;

function apiUrl(path: string, params: ClioParams = {}) {
  const url = new URL(path.startsWith("https://") ? path : `${API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** One authenticated GET. Refreshes the token once on 401 and waits out one short rate limit. */
async function get(url: string, redirect: RequestRedirect = "follow"): Promise<Response> {
  let refreshed = false;
  let waited = 0;
  for (;;) {
    const token = await accessToken(refreshed);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect,
    });
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      continue;
    }
    // Clio allows 50 requests a minute per token during the day and says how long to wait.
    const retryAfter = Number(res.headers.get("retry-after"));
    if (res.status === 429 && waited < 3 && retryAfter > 0 && retryAfter <= 60) {
      waited += 1;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    return res;
  }
}

async function failure(res: Response): Promise<ClioError> {
  const body = (await res.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
  const detail = body?.error?.message ?? res.statusText;
  return new ClioError(`Clio answered ${res.status}${body?.error?.type ? ` ${body.error.type}` : ""}: ${detail}`, 502);
}

/** GET one record. */
export async function clioGetOne<T>(path: string, params?: ClioParams): Promise<T> {
  const res = await get(apiUrl(path, params));
  if (!res.ok) throw await failure(res);
  return ((await res.json()) as { data: T }).data;
}

/** GET a list, following Clio's paging until there is no next page. */
export async function clioGet<T>(path: string, params: ClioParams = {}): Promise<T[]> {
  const rows: T[] = [];
  let next: string | undefined = apiUrl(path, { limit: 200, ...params });
  while (next) {
    const res: Response = await get(next);
    if (!res.ok) throw await failure(res);
    const page = (await res.json()) as { data: T[]; meta?: { paging?: { next?: string } } };
    rows.push(...page.data);
    next = page.meta?.paging?.next;
  }
  return rows;
}

/** The bytes of a document. Clio answers with a redirect to a signed URL, which is fetched without our token. */
export async function clioDownload(documentId: string): Promise<Buffer> {
  const res = await get(apiUrl(`/documents/${documentId}/download.json`), "manual");
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) throw await failure(res);
  const file = await fetch(location, { cache: "no-store" });
  if (!file.ok) throw new ClioError(`The document could not be downloaded from Clio (${file.status}).`, 502);
  return Buffer.from(await file.arrayBuffer());
}
