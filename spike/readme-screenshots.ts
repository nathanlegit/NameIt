// README screenshots -> docs/screenshots/*.jpg (server on port 3123).
//   pnpm tsx spike/readme-screenshots.ts
// Footage in the shots is from the public-domain Prelinger films where possible.

import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

// Descriptions "speak" forever, so the player stays on the cue for the shot.
const HOLD_SPEECH = `
  window.__spoken = 0;
  Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [], addEventListener() {}, cancel() {}, speak() { window.__spoken++; } } });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLAudioElement) { if (this.dataset.cueText) window.__spoken++; return Promise.resolve(); }
    return realPlay.call(this);
  };
`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(HOLD_SPEECH);
const settle = () => new Promise((resolve) => setTimeout(resolve, 900));
const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82 });

// 1. Player, paused on the escape-wheel description (held-watch, 2:38).
await page.goto(`${BASE}/watch/held-watch`, { waitUntil: "load" });
await settle();
await page.evaluate(() => { const video = document.querySelector("video")!; video.currentTime = 157.6; });
await settle();
await page.click(".ctrl.play");
await page.waitForFunction(() => (window as unknown as { __spoken: number }).__spoken > 0, { timeout: 15_000 });
await settle();
await page.mouse.move(0, 0);
await shot("watch");

// 2. Review: the escape wheel item, then the flagged first item (SAM boxed grass).
await page.goto(`${BASE}/review/held-watch`, { waitUntil: "load" });
await settle();
await page.click(".item-list li:nth-child(9) button");
await settle();
await page.mouse.move(0, 0);
await shot("review");
await page.click(".item-list li:nth-child(1) button");
await settle();
await shot("review-flagged");

// 3. Video list and evaluation.
await page.goto(`${BASE}/`, { waitUntil: "load" });
await settle();
await shot("videos");
await page.goto(`${BASE}/eval`, { waitUntil: "load" });
await settle();
await shot("eval");

await browser.close();
console.log(`Saved screenshots to ${OUT}/`);
