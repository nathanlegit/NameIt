// Screenshots of the main pages for a visual check (and demo stills).
//   pnpm tsx spike/screenshots.ts <outputDir> [light|dark]   (server on port 3123)

import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const outputDir = process.argv[2] ?? ".";
const scheme = (process.argv[3] ?? "light") as "light" | "dark";

const PAGES: Array<[string, string]> = [
  ["home", "/"],
  ["review-watch", "/review/held-watch"],
  ["review-meat", "/review/held-meat"],
  ["watch-clip1", "/watch/clip1"],
  ["eval", "/eval"],
];

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
for (const [name, url] of PAGES) {
  await page.goto(`${BASE}${url}`, { waitUntil: "load" });
  await new Promise((resolve) => setTimeout(resolve, 800)); // the player keeps loading video, so "network idle" never comes
  await page.screenshot({ path: path.join(outputDir, `${name}-${scheme}.png`), fullPage: name === "eval" });
}
await browser.close();
console.log(`Saved ${PAGES.length} screenshots to ${outputDir}`);
