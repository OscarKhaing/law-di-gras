// Take a picture of a page, optionally after some steps, so UI work can be checked by eye:
//   pnpm -s script scripts/screenshot.ts /cases/c-1001 --click "Open sample" --wait 2000 --out screenshots/review.png
//
// Steps run in the order given:  --click <text a button or link starts with, or else contains>
//                                 --upload <file>   --wait <ms>
// Other options:                 --out <file.png> (default screenshots/latest.png)
//                                --size 1440x900   --full (whole page, not just the window)
//
// Needs `pnpm dev` running (or pass a full URL) and Chrome installed; set CHROME_PATH if it is not
// in the default macOS location. Console errors from the page are printed.
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function main() {
  const [target, ...rest] = process.argv.slice(2);
  if (!target) throw new Error("Usage: pnpm -s script scripts/screenshot.ts <path or URL> [steps and options]");

  const steps: { kind: "click" | "upload" | "wait"; value: string }[] = [];
  let out = "screenshots/latest.png";
  let size = "1440x900";
  let full = false;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--full") full = true;
    else if (flag === "--out") out = rest[++i];
    else if (flag === "--size") size = rest[++i];
    else if (flag === "--click" || flag === "--upload" || flag === "--wait") {
      steps.push({ kind: flag.slice(2) as "click" | "upload" | "wait", value: rest[++i] });
    } else throw new Error(`Unknown option: ${flag}`);
  }

  const [width, height] = size.split("x").map(Number);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    page.on("console", (message) => message.type() === "error" && console.error("console error:", message.text()));
    page.on("pageerror", (error) => console.error("page error:", String(error)));

    await page.goto(target.startsWith("http") ? target : `http://localhost:3000${target}`, {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });

    for (const step of steps) {
      if (step.kind === "wait") {
        await sleep(Number(step.value));
      } else if (step.kind === "upload") {
        const input = await page.$("input[type=file]");
        if (!input) throw new Error("No file input on the page.");
        await input.uploadFile(resolve(step.value));
      } else {
        const clicked = await page.evaluate((text) => {
          const all = [...document.querySelectorAll<HTMLElement>("button, a, [role=button]")];
          const element =
            all.find((el) => el.textContent?.trim().startsWith(text)) ??
            all.find((el) => el.textContent?.includes(text));
          element?.scrollIntoView({ block: "center" });
          element?.click();
          return Boolean(element);
        }, step.value);
        if (!clicked) throw new Error(`Nothing to click with the text "${step.value}".`);
      }
      await sleep(500); // let the page react before the next step
    }

    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out as `${string}.png`, fullPage: full });
    console.log(resolve(out));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
