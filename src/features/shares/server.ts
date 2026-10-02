import type { ShareStatus } from "./schema";

/** Every update shared from a case, with its opens and replies. Lane 3 builds this. */
export async function sharesFor(matterId: number): Promise<ShareStatus[]> {
  void matterId;
  return [];
}
