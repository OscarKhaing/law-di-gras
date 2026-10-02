// Record a walk through the app as a video, with a caption for each step.
//   pnpm -s script scripts/record-clip.ts [--base https://your-site] [--provider /p/<token>] [--out clip.mp4]
// It opens the first case on the list and drives the real pages; nothing is staged. It needs Chrome
// and ffmpeg (puppeteer records through it). Steps that wait on a model run in real time.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const BASE = flag("--base", "http://localhost:3000").replace(/\/$/, "");
const PROVIDER = flag("--provider", "");
const OUT = flag("--out", "screenshots/clip.mp4");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A caption along the foot of the window, kept across the steps of one page. */
async function caption(page: Page, text: string) {
  await page.evaluate((words) => {
    let bar = document.getElementById("clip-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "clip-caption";
      Object.assign(bar.style, {
        position: "fixed",
        left: "50%",
        bottom: "28px",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        maxWidth: "70%",
        padding: "12px 22px",
        borderRadius: "10px",
        background: "rgba(20, 28, 24, 0.92)",
        color: "#fff",
        font: "500 20px/1.35 'IBM Plex Sans', system-ui, sans-serif",
        textAlign: "center",
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      });
      document.body.appendChild(bar);
    }
    bar.textContent = words;
  }, text);
}

/** The caption, set now and once more after the page has settled, in case starting up swept it away. */
async function say(page: Page, text: string) {
  await caption(page, text);
  setTimeout(() => void caption(page, text).catch(() => {}), 700);
}

/** Click the first button, link or tab whose words start with, or else contain, `text`. */
async function click(page: Page, text: string) {
  const done = await page.evaluate((words) => {
    const all = [...document.querySelectorAll<HTMLElement>("button, a, [role=tab]")].filter((el) => el.offsetParent !== null);
    const said = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const el = all.find((one) => said(one).startsWith(words)) ?? all.find((one) => said(one).includes(words));
    el?.scrollIntoView({ block: "center" });
    el?.click();
    return Boolean(el);
  }, text);
  if (!done) console.warn(`  nothing to click: "${text}"`);
  return done;
}

async function scrollTo(page: Page, top: number) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), top);
}

/** Wait until `test` is true in the page, or give up after `ms`. */
async function until(page: Page, test: () => boolean, ms: number) {
  await page.waitForFunction(test, { timeout: ms, polling: 400 }).catch(() => console.warn("  gave up waiting"));
}

async function main() {
  mkdirSync("screenshots", { recursive: true });
  const raw = OUT.replace(/\.mp4$/, ".webm");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--hide-scrollbars"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(45_000);
    // tsx names the helper functions inside page.evaluate with a `__name` call that the page does not have.
    await page.evaluateOnNewDocument("window.__name = (fn) => fn");

    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    const recorder = await page.screencast({ path: raw as `${string}.webm` });
    const started = Date.now();
    const mark = (step: string) => console.log(`${String(Math.round((Date.now() - started) / 1000)).padStart(3)} s  ${step}`);

    mark("case list");
    await say(page, "Case Desk reads each matter live from Clio. Nothing is written back.");
    await sleep(3000);

    const casePath = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href^="/cases/"]')?.getAttribute("href") ?? "");
    if (!casePath) throw new Error("No case on the list to open.");
    await page.goto(`${BASE}${casePath}`, { waitUntil: "networkidle0" });
    mark("overview");
    await say(page, "Open a case: where it stands, in ninety seconds. Every line cites its source.");
    await sleep(3500);
    await scrollTo(page, 650);
    await say(page, "What it is worth, against the coverage behind it.");
    await sleep(3500);

    await scrollTo(page, 0);
    await sleep(700);
    mark("a source");
    await page.evaluate(() => {
      const link = [...document.querySelectorAll<HTMLElement>("main button, [data-slot=sidebar-inset] button")].find((el) => /^(note|email|call), /.test((el.textContent ?? "").trim()));
      link?.click();
    });
    await say(page, "Click any source: the note, email or page it came from, with the passage marked.");
    await sleep(4000);
    await page.keyboard.press("Escape");
    await sleep(600);

    mark("ask");
    await page.click('input[placeholder^="Ask about this case"]').catch(() => {});
    await page.keyboard.type("Who are we waiting on?", { delay: 45 });
    await say(page, "Ask it like a colleague, typed or by voice. The answer comes with its sources.");
    await page.keyboard.press("Enter");
    await until(page, () => /Open (To do|Overview|Money|Medical|Timeline|Red flags|Full file|Time on desk)|sources|does not say/i.test(document.body.innerText) && !/Looking through the file/.test(document.body.innerText), 20_000);
    await sleep(4500);

    await page.goto(`${BASE}${casePath}?tab=money`, { waitUntil: "networkidle0" });
    mark("money");
    await scrollTo(page, 620);
    await say(page, "Try a settlement: fee, costs, liens, and what the client is left with.");
    await sleep(4500);

    await page.goto(`${BASE}${casePath}?tab=medical`, { waitUntil: "networkidle0" });
    mark("medical");
    await say(page, "Treatment on record, from every page of the records: and where the records stop.");
    await sleep(4500);

    await page.goto(`${BASE}${casePath}?tab=todo`, { waitUntil: "networkidle0" });
    mark("to do");
    await say(page, "Who the firm is waiting on, longest first. Draft the follow-up, share an update, or call.");
    await sleep(2500);
    await click(page, "Draft a follow-up");
    await until(page, () => /Nothing is sent/i.test(document.body.innerText), 40_000);
    await page.evaluate(() => [...document.querySelectorAll("textarea")].at(-1)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    await say(page, "A follow-up drafted from that one thread. Nothing is sent: you edit and copy it.");
    await sleep(4500);

    await page.goto(`${BASE}${casePath}?tab=calls`, { waitUntil: "networkidle0" });
    mark("calls");
    await click(page, "Read what was said");
    await say(page, "Calls placed from the browser are timed by the carrier and transcribed.");
    await sleep(4000);

    await page.goto(`${BASE}${casePath}?tab=time`, { waitUntil: "networkidle0" });
    mark("time on desk");
    await say(page, "Time on desk, rebuilt from the record: by person, by kind of work, by phase.");
    await sleep(3500);
    await scrollTo(page, 520);
    await sleep(3500);

    if (PROVIDER) {
      await page.goto(`${BASE}${PROVIDER}`, { waitUntil: "networkidle0" });
      mark("provider's page");
      await say(page, "The treating provider sees only what the attorney approved, and can answer.");
      await sleep(4500);
    }

    await page.goto(`${BASE}${casePath}?tab=about`, { waitUntil: "networkidle0" });
    mark("cost");
    await say(page, "One case read once: under two dollars. Opening it again costs nothing.");
    await sleep(4000);

    await recorder.stop();
    mark("recorded");
  } finally {
    await browser.close();
  }

  // H.264 in an MP4 plays everywhere, including in a Drive preview.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", "30", OUT]);
  const seconds = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT]).toString().trim();
  console.log(`${OUT}: ${Math.round(Number(seconds))} s`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
