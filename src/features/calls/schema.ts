// A call placed through Case Desk. Browser-safe. This is the contract between the calls feature,
// the time-on-desk report and the case page.

/** One thing said on a call, as transcribed. */
export type CallLine = { speaker: "firm" | "them"; text: string; at: string };

export type CallLog = {
  id: string;
  matterId: number;
  /** The contact in the case file, when the call was to one. */
  contactRef: string | null;
  contactName: string;
  toNumber: string;
  /** Who at the firm placed it. */
  placedBy: string;
  /** started, ringing, in-progress, completed, busy, no-answer, failed, canceled. */
  status: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  /** How long the call lasted once answered, as the phone carrier reports it; null until it ends. */
  seconds: number | null;
  transcript: CallLine[];
  summary: string | null;
};
