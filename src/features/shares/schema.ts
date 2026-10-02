// An update the firm shares with one treating provider. Browser-safe.
// The firm side works on an UpdateDraft; publishing freezes the switched-on lines into a
// ProviderUpdate, which is the only thing the provider's page can ever read.

import { z } from "zod";
import { Evidence } from "@/features/cases/schema";

export const SECTIONS = ["status", "coverage", "needs", "attendance", "on file", "other treatment", "movement"] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * The heading each section has: the question a provider's office asks, in the words billing and lien
 * coordinators used when asked what they need. The provider's page reads as their questions answered,
 * and the attorney's composer shows which question each line answers.
 */
export const SECTION_HEADINGS: Record<Section, string> = {
  status: "Where does the case stand?",
  coverage: "Is there coverage behind the case?",
  needs: "What does the firm need from my office right now?",
  attendance: "Is my patient still showing up to treatment?",
  "on file": "What does the firm have from my office?",
  "other treatment": "What other care is my patient getting?",
  movement: "Has the case moved?",
};

/** The order on the provider's page: what the firm is asking for comes first. */
export const PROVIDER_ORDER: readonly Section[] = ["needs", "status", "movement", "attendance", "on file", "coverage", "other treatment"];

/** Sections where every line is the attorney's call, whatever the model said: they start switched off. */
export const ATTORNEYS_CALL: readonly Section[] = ["coverage", "attendance", "other treatment"];

/** The section a line belongs to. The model's wording is not enforced, so anything unrecognised is case status. */
export function sectionOf(said: string): Section {
  const text = said.trim().toLowerCase();
  return SECTIONS.find((section) => section === text) ?? SECTIONS.find((section) => text.includes(section)) ?? "status";
}

/** What the model drafts for the attorney to check. */
export const UpdateDraft = z.object({
  lines: z.array(
    z.object({
      section: z.string().describe(`One of: ${SECTIONS.join(", ")}`),
      text: z
        .string()
        .describe("One plain sentence for the provider's office. Facts only: no view on liability, value, credibility or tactics"),
      yourCall: z
        .boolean()
        .describe("True when an attorney should decide before this leaves the firm: amounts, attendance, other providers' treatment, timing"),
      evidence: Evidence,
    }),
  ),
});
export type UpdateDraft = z.infer<typeof UpdateDraft>;

/** A drafted line as the attorney edits it: `share` is the switch, and starts off for `yourCall` lines. */
export type DraftLine = UpdateDraft["lines"][number] & { id: string; share: boolean };

/** `shares.payload`: frozen at publish. No refs, no Clio ids, nothing the attorney switched off. */
export type ProviderUpdate = {
  firm: string;
  /** Who at the firm to call or write to. */
  contactLine: string;
  patient: string;
  provider: string;
  /** Clio's own word for the matter's status at publishing, e.g. "Open". An update published before this was carried has none. */
  status?: string;
  stage: string;
  stages: string[];
  lines: { id: string; section: string; text: string }[];
  publishedAt: string;
  expiresAt: string;
};

/** Something the provider's office wrote back. `lineId` is the request it answers. */
export type Reply = { lineId: string | null; text: string; at: string };

/** A file the provider's office sent with its answer to one request, as its own page lists it. */
export type SentFile = { lineId: string | null; name: string; bytes: number; at: string };

/** The same file as the firm sees it: `path` is where it is kept in our private storage, never in Clio. */
export type ReceivedFile = SentFile & { path: string };

/** What the firm sees about an update it shared. */
export type ShareStatus = {
  id: string;
  contactRef: string;
  contactName: string;
  publishedAt: string;
  expiresAt: string;
  revoked: boolean;
  opens: number;
  lastOpenedAt: string | null;
  /** What the provider wrote back. It lives in our database; nothing is written to Clio. */
  replies: Reply[];
  /** Files the provider's office attached. They are kept in our storage; nothing is written to Clio. */
  files: ReceivedFile[];
};

// ---- What a request may carry. Everything is checked against these before it reaches the database. ----

export const REPLY_LIMIT = 2000;

/** The kinds of file a provider's office may attach, by the type the browser reports, and what each is called. */
export const FILE_KINDS: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG" };
/** What the page says of them, and what the file chooser offers. */
export const FILE_KINDS_SAID = "PDF, JPEG or PNG";
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const FILE_MAX_MB = FILE_MAX_BYTES / (1024 * 1024);
/** How many files one link takes in all. */
export const FILES_PER_SHARE = 10;

/** A file's size as a person says it: "340 KB", "4.2 MB". */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

export const MatterId = z.number().int().positive();
export const ContactRef = z.string().regex(/^P\d+$/, "Not a contact on the case.");
export const ShareToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Not a link.");
export const LineId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Not a line of the update.");

/** The lines the attorney publishes, as the composer sends them. Same shape as DraftLine. */
export const DraftLines = z
  .array(
    z.object({
      id: LineId,
      section: z.string().max(40),
      text: z.string().max(1000),
      yourCall: z.boolean(),
      evidence: z.array(z.object({ source: z.string().max(40), quote: z.string().max(600) })).max(20),
      share: z.boolean(),
    }),
  )
  .max(80);

export const DraftBody = z.object({ matterId: MatterId, contactRef: ContactRef });
export const PublishBody = z.object({ matterId: MatterId, contactRef: ContactRef, lines: DraftLines });
export const RevokeBody = z.object({ shareId: z.uuid() });
export const FileBody = z.object({ shareId: z.uuid(), path: z.string().min(1).max(300) });
export const ReplyBody = z.object({ token: ShareToken, lineId: LineId, text: z.string().trim().min(1).max(REPLY_LIMIT) });
