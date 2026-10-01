/** Browser-side fetch for our API routes; throws with the server's error message on failure. */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}
