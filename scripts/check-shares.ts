// Check the provider link end to end against the database, without a browser or a model:
//   pnpm -s script scripts/check-shares.ts            publish, open, reply, attach a file, republish, withdraw, then delete what it made
//   pnpm -s script scripts/check-shares.ts --keep     stop after the reply and print the page's address, to look at it
//   pnpm -s script scripts/check-shares.ts --remove <share id>    delete a share left by --keep
//   pnpm -s script scripts/check-shares.ts --material <contact ref>    print what the drafting model would be sent for that provider
// The lines it publishes are plain test text, not facts of the case. It never touches a provider
// who already has a live update.
import { getBrief } from "@/features/brief/server";
import { getCaseFile, listCases } from "@/features/cases/server";
import type { DraftLine } from "@/features/shares/schema";
import { FILE_MAX_BYTES } from "@/features/shares/schema";
import { finishUpload, getShareByToken, recordOpen, replyToShare, ShareError, startUpload } from "@/features/shares/link";
import { getDraft, previewMaterial, publishShare, receivedFileUrl, revokeShare, sharesFor } from "@/features/shares/server";
import { supabase } from "@/server/supabase";

let failures = 0;
function check(what: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
}

async function remove(shareId: string) {
  if (!/^[0-9a-f-]{36}$/.test(shareId ?? "")) throw new Error("Give the id of the share to remove.");
  // The files sent through the share are in its own folder of the bucket; they go with it.
  const storage = supabase().storage.from("documents");
  const { data: held } = await storage.list(`shares/${shareId}`, { limit: 100 });
  if (held?.length) await storage.remove(held.map((object) => `shares/${shareId}/${object.name}`));
  const { error } = await supabase().from("shares").delete().eq("id", shareId);
  if (error) throw error;
  console.log(`Deleted share ${shareId}, its events and ${held?.length ?? 0} file(s).`);
}

/** Whether a call was refused with a ShareError, as a request that must not go through should be. */
const refused = (call: Promise<unknown>) => call.then(() => false, (err) => err instanceof ShareError);

/** Send bytes to a one-time upload address the way the office's browser does. */
const put = (url: string, bytes: Uint8Array<ArrayBuffer>, type: string) => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: bytes });

const text = (words: string) => new Uint8Array(new TextEncoder().encode(words));
// The smallest thing that starts the way a PDF does. It is test bytes, not a record.
const TEST_PDF = text("%PDF-1.4\n% a test file from scripts/check-shares.ts\n%%EOF\n");

const line = (id: string, section: string, text: string, share: boolean): DraftLine => ({
  id,
  section,
  text,
  yourCall: !share,
  evidence: [],
  share,
});

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--remove") return remove(args[1]);
  const keep = args.includes("--keep");

  const [first] = await listCases();
  if (first && args[0] === "--material") {
    // Everything the drafting model would be sent for one provider, word for word. No model is called.
    return console.log((await previewMaterial(first.matterId, args[1])).prompt);
  }
  if (!first) return console.log("No case has been read from Clio yet, so nothing can be published. Read a case first.");
  const file = (await getCaseFile(first.matterId))!;
  const stored = await getBrief(file.matterId);
  const existing = await sharesFor(file.matterId);
  const hasLive = (ref: string) =>
    existing.some((share) => share.contactRef === ref && !share.revoked && share.expiresAt > new Date().toISOString());

  // The first treating provider without a live update: by the brief when there is one, otherwise by the role Clio gives.
  const treating = new Set((stored?.brief.people ?? []).filter((person) => person.treating).map((person) => person.contact));
  const contacts = file.entries.filter((entry) => entry.kind === "contact" && entry.facts.isClient !== true && !hasLive(entry.ref));
  const provider =
    contacts.find((entry) => treating.has(entry.ref)) ?? contacts.find((entry) => /treating|provider/i.test(entry.text));
  if (!provider) return console.log("No treating provider without a live update was found in the case file.");
  console.log(`Case ${file.matterId}, provider ${provider.ref} (${provider.title})\n`);

  // What the drafting model would be given: only this office's business.
  const { material, prompt } = await previewMaterial(file.matterId, provider.ref);
  console.log(
    `Material for the draft: ${material.staff.length} more at the practice, ${material.tasks.length} tasks, ${material.messages.length} emails and calls, ` +
      `${material.calendar.length} calendar entries, ${material.held.length} documents held, ${material.others.length} other providers, ` +
      `${material.coverage.length} coverage figures; ${prompt.length.toLocaleString("en-US")} characters in all`,
  );
  const own = [material.provider, ...material.staff, ...material.tasks, ...material.messages, ...material.calendar, ...material.held];
  check("no note, custom field or expense is in the material", own.every((item) => !/^[NFX]\d/.test(item.ref)));
  const working = [...material.tasks, ...material.calendar, ...material.messages.filter((item) => item.detail?.startsWith("Phone call"))];
  check("of a task, a calendar entry and a phone call only the heading is in the material, never the firm's description", working.every((item) => item.text === ""));
  const kept = file.entries.filter((entry) => ["note", "field", "expense"].includes(entry.kind) && entry.text.trim().length > 40);
  check("the text of no note, custom field or expense is in what the model is sent", kept.every((entry) => !prompt.includes(entry.text.trim().slice(0, 40))));
  const clientMessages = file.entries.filter((entry) => (entry.kind === "email" || entry.kind === "call") && entry.people.includes(file.client.name));
  check("no message the client took part in is in the material", clientMessages.every((entry) => !material.messages.some((item) => item.ref === entry.ref)));

  // Nobody but a treating provider can be drafted for or published to: not the client, not the other side.
  const people = file.entries.filter((entry) => entry.kind === "contact");
  const outsider =
    people.find((entry) => stored !== null && entry.facts.isClient !== true && !treating.has(entry.ref)) ?? people.find((entry) => entry.facts.isClient === true);
  if (outsider) {
    const refused = await previewMaterial(file.matterId, outsider.ref).then(() => false, (err) => err instanceof ShareError);
    check("a contact who is not a treating provider is refused", refused, outsider.text);
  }

  // Publish: two lines switched on, one switched off.
  const lines = [
    line("check-1", "status", "Test line one. This is a check of the provider link, not a case update.", true),
    line("check-2", "needs", "Test line two. A request the office can reply to.", true),
    line("check-3", "coverage", "Test line three. Switched off, so it must not leave the firm.", false),
  ];
  const published = await publishShare(file.matterId, provider.ref, lines);
  const token = published.token;
  check("publishing returns a token and a 30-day expiry", typeof token === "string" && token.length >= 40, `expires ${published.expiresAt}`);
  if (!token) return remove(published.shareId);

  try {
    const { data: row } = await supabase().from("shares").select("*").eq("id", published.shareId).single();
    check("the token itself is not stored, only its hash", !JSON.stringify(row).includes(token) && /^[0-9a-f]{64}$/.test(row.token_hash));
    check("the payload carries no refs and no Clio ids", !/"(evidence|source|clioId|ref|matterId)"/.test(JSON.stringify(row.payload)));

    const opened = await getShareByToken(token);
    check("the link opens the update", opened !== null && opened.update.provider === provider.title);
    // Looking the update up records nothing; the page records the open itself, after it has answered.
    if (opened) await recordOpen(opened.id, "check-shares");
    check("only the lines switched on are in it", opened?.update.lines.map((item) => item.id).join() === "check-1,check-2");
    check("the stage and stages come from the case file", opened?.update.stage === file.stage && opened.update.stages.length === file.stages.length);

    const reply = await replyToShare(token, "check-2", "Test reply from the provider's office.");
    check("a reply is stored", Boolean(reply.at), reply.at);
    const again = await getShareByToken(token);
    check("the reply comes back with the update", again?.replies.length === 1 && again.replies[0].lineId === "check-2");

    const refusals = await Promise.all([
      replyToShare(token, "check-3", "x").then(() => false, (err) => err instanceof ShareError),
      replyToShare(token, "check-2", "x".repeat(2001)).then(() => false, (err) => err instanceof ShareError),
      replyToShare(token, "check-2", "   ").then(() => false, (err) => err instanceof ShareError),
    ]);
    check("a reply to a line that was not shared, a reply over 2,000 characters and an empty reply are refused", refusals.every(Boolean));

    // Attaching a file: asked for, sent straight to storage, then confirmed.
    const pdf = "application/pdf";
    check("an upload is refused for a dead link", await refused(startUpload(`${token.slice(0, -4)}AAAA`, "check-2", "test.pdf", pdf, TEST_PDF.length)));
    check("an upload is refused for a line that was not shared", await refused(startUpload(token, "check-3", "test.pdf", pdf, TEST_PDF.length)));
    check("an upload of a kind that is not a PDF, JPEG or PNG is refused", await refused(startUpload(token, "check-2", "test.docx", "application/msword", 1000)));
    check("an upload over 20 MB is refused", await refused(startUpload(token, "check-2", "test.pdf", pdf, FILE_MAX_BYTES + 1)));

    const slot = await startUpload(token, "check-2", "../Test file (1).PDF", pdf, TEST_PDF.length);
    check(
      "the file's place is in the share's own folder, under a safe name",
      slot.path.startsWith(`shares/${published.shareId}/`) && /^[0-9a-f]{16}-Test-file-1\.pdf$/.test(slot.path.split("/")[2] ?? ""),
      slot.path,
    );
    check("a file that has not arrived is not recorded", await refused(finishUpload(token, "check-2", slot.path)));
    const sent = await put(slot.url, TEST_PDF, pdf);
    check("the browser can send the file straight to storage", sent.ok, `${sent.status}`);
    const outside = [`shares/${published.shareId}/../${slot.path.split("/")[2]}`, slot.path.replace(published.shareId, "00000000-0000-4000-8000-000000000000"), "clio/test.pdf"];
    check("a path outside the share's folder is refused", (await Promise.all(outside.map((path) => refused(finishUpload(token, "check-2", path))))).every(Boolean));
    const recorded = await finishUpload(token, "check-2", slot.path);
    check("the file is recorded with its name and size", recorded.name === "Test-file-1.pdf" && recorded.bytes === TEST_PDF.length, `${recorded.name}, ${recorded.bytes} bytes`);
    await finishUpload(token, "check-2", slot.path);
    const listed = await getShareByToken(token);
    check("the office's page lists it once, without where it is kept", listed?.files.length === 1 && !JSON.stringify(listed.files).includes("shares/"));

    // A file that is not what it says it is: sent as a PDF, but its bytes are plain text.
    const fake = await startUpload(token, "check-2", "not-a-pdf.pdf", pdf, 20);
    await put(fake.url, text("just some plain text"), pdf);
    check("a file whose contents are not a PDF, JPEG or PNG is refused", await refused(finishUpload(token, "check-2", fake.path)));
    const { data: left } = await supabase().storage.from("documents").list(`shares/${published.shareId}`);
    check("and is deleted from storage", left?.length === 1, `${left?.length} file(s) in the folder`);

    const seen = (await sharesFor(first.matterId)).find((share) => share.id === published.shareId);
    check("the firm sees the file on the share", seen?.files.length === 1 && seen.files[0].path === slot.path && seen.files[0].lineId === "check-2");
    const opening = await receivedFileUrl(published.shareId, slot.path);
    const fetched = await fetch(opening.url);
    check("the firm can open it", fetched.ok && (await fetched.arrayBuffer()).byteLength === TEST_PDF.length);
    check("the firm cannot open a path the office did not send", await refused(receivedFileUrl(published.shareId, fake.path)));

    if (keep) {
      console.log(`\nKept. Open http://localhost:3000/p/${token}`);
      console.log(`Remove it with: pnpm -s script scripts/check-shares.ts --remove ${published.shareId}`);
      return;
    }

    const second = await publishShare(file.matterId, provider.ref, [...lines, line("check-4", "movement", "Test line four, added on republishing.", true)]);
    const updated = await getShareByToken(token);
    check("publishing again keeps the same link and changes what it shows", second.token === null && second.shareId === published.shareId && updated?.update.lines.length === 3);
    check("the draft is kept for the attorney, with the switched-off line", (await getDraft(file.matterId, provider.ref))?.length === 4);

    check("a wrong token opens nothing", (await getShareByToken(`${token.slice(0, -4)}AAAA`)) === null);
    check("a malformed token opens nothing", (await getShareByToken("../shares")) === null);

    const status = (await sharesFor(file.matterId)).find((share) => share.id === published.shareId);
    check("the firm sees the opens and the reply", status?.opens === 1 && status.replies.length === 1 && status.lastOpenedAt !== null, `${status?.opens} opens`);

    const revoked = await revokeShare(published.shareId);
    check("the link can be withdrawn", revoked.revoked);
    check("a withdrawn link opens nothing", (await getShareByToken(token)) === null);
    check("a withdrawn link takes no reply", await replyToShare(token, "check-2", "x").then(() => false, (err) => err instanceof ShareError));
    check("a withdrawn link takes no file", await refused(startUpload(token, "check-2", "test.pdf", pdf, TEST_PDF.length)));
    check("a file sent before the link was withdrawn cannot be confirmed after", await refused(finishUpload(token, "check-2", slot.path)));
    check("no draft is live after withdrawing", (await getDraft(file.matterId, provider.ref)) === null);
  } finally {
    if (!keep) await remove(published.shareId);
  }
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
