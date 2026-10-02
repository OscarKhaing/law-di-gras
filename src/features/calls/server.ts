import type { CallLog } from "./schema";

/** Every call placed through Case Desk on a case, newest first. The calls builder implements this. */
export async function callsFor(matterId: number): Promise<CallLog[]> {
  void matterId;
  return [];
}
