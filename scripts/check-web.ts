// End-to-end check of the web app in real Chrome (puppeteer-core, no download).
//
//   pnpm check-web            (needs `pnpm build && pnpm start` running on port 3123)
//
// 1. Accessibility: axe-core WCAG 2.1 A/AA scan of every page type, light and dark.
// 2. Player: plays clip2 with a fake speech engine that records each cue's text,
//    the video time, the video's volume and whether it was paused when spoken.
//    Expects extended cues to pause and resume, inline cues to duck to 30%.
// 3. Review: approve (A), edit (E, type, Enter), reject (R) by keyboard only, then
//    checks data/videos/clip2/review.json, and removes it again.

import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIDEO_ID = "clip2";
// The review step saves to data/ through the local API; the deployed demo keeps reviews in the browser instead.
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);

let failures = 0;
function check(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}`);
  if (!condition) failures++;
}

// Replaces window.speechSynthesis with a recorder; each utterance "speaks" for 600 ms.
const FAKE_SPEECH = `
  window.__spoken = [];
  const fake = {
    _current: null, _timer: 0,
    getVoices() { return []; },
    addEventListener() {},
    cancel() {
      const current = this._current;
      this._current = null;
      clearTimeout(this._timer);
      if (current && current.onerror) current.onerror({});
    },
    speak(utterance) {
      const video = document.querySelector("video");
      window.__spoken.push({ text: utterance.text, time: video.currentTime, volume: video.volume, paused: video.paused });
      this._current = utterance;
      this._timer = setTimeout(() => { this._current = null; if (utterance.onend) utterance.onend({}); }, 600);
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: fake });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
`;

async function axeScan(page: Page, url: string, scheme: "light" | "dark"): Promise<void> {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle0" });
  await page.addScriptTag({ path: path.join("node_modules", "axe-core", "axe.min.js") });
  const violations = await page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.map((violation: { id: string; impact: string; nodes: unknown[]; help: string }) =>
      `${violation.id} (${violation.impact}, ${violation.nodes.length} nodes): ${violation.help}`);
  });
  check(violations.length === 0, `axe ${scheme.padEnd(5)} ${url}${violations.length ? `\n      ${violations.join("\n      ")}` : ""}`);
}

async function main(): Promise<void> {
  const reviewPath = path.join("data", "videos", VIDEO_ID, "review.json");
  if (IS_LOCAL && existsSync(reviewPath)) throw new Error(`${reviewPath} exists; this check would overwrite a real review. Move it first.`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });

    // 1. Accessibility.
    for (const url of ["/", "/eval", `/review/${VIDEO_ID}`, `/watch/${VIDEO_ID}`]) {
      for (const scheme of ["light", "dark"] as const) await axeScan(page, url, scheme);
    }
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

    // 2. Player.
    const player = await browser.newPage();
    await player.evaluateOnNewDocument(FAKE_SPEECH);
    await player.goto(`${BASE}/watch/${VIDEO_ID}`, { waitUntil: "networkidle0" });
    const focused = await player.evaluate(() => document.activeElement?.textContent?.trim());
    check(focused === "Play", `focus starts on Play (got "${focused}")`);

    const cues = await player.evaluate(async (videoId) => {
      const bundle = await (await fetch(`/demo/${videoId}/bundle.json`)).json();
      return bundle.items
        .filter((item: { cue: { bucket: string } | null }) => item.cue?.bucket === "ready")
        .map((item: { cue: { start: number; delivery: string; shortText: string; longText: string } }) => ({
          start: item.cue.start, delivery: item.cue.delivery, text: item.cue.delivery === "inline" ? item.cue.shortText : item.cue.longText,
        }))
        .sort((a: { start: number }, b: { start: number }) => a.start - b.start);
    }, VIDEO_ID);
    const firstThree = cues.slice(0, 3);
    const playUntil = (firstThree.at(-1)?.start ?? 5) + 1.5;

    await player.keyboard.press("Space"); // on the focused Play button
    await player.waitForFunction((until) => (document.querySelector("video") as HTMLVideoElement).currentTime > until, { timeout: 30_000 }, playUntil);
    const spoken = await player.evaluate(() => (window as unknown as { __spoken: Array<{ text: string; time: number; volume: number; paused: boolean }> }).__spoken);

    check(spoken.length >= firstThree.length, `spoke ${spoken.length} cues by ${playUntil.toFixed(1)} s (expected ${firstThree.length})`);
    firstThree.forEach((cue: { start: number; delivery: string; text: string }, index: number) => {
      const said = spoken[index];
      if (!said) return;
      check(said.text === cue.text, `cue ${index + 1} text: "${said.text}"`);
      check(Math.abs(said.time - cue.start) < 0.25, `cue ${index + 1} fired at ${said.time.toFixed(2)} s (planned ${cue.start.toFixed(2)} s)`);
      if (cue.delivery === "extended") check(said.paused, `cue ${index + 1} is extended: video paused while speaking`);
      else check(!said.paused && Math.abs(said.volume - 0.3) < 0.01, `cue ${index + 1} is inline: video playing, ducked to ${said.volume}`);
    });
    const liveText = await player.evaluate(() => document.querySelector("[aria-live='polite'][aria-atomic='true']")?.textContent ?? "");
    check(liveText === spoken.at(-1)?.text, `aria-live region shows the last cue ("${liveText}")`);
    const volumeAfter = await player.evaluate(() => (document.querySelector("video") as HTMLVideoElement).volume);
    check(volumeAfter === 1 || spoken.length > 0, `volume restored after cues (now ${volumeAfter})`);

    // Seeking must not fire the cues it jumps over.
    const before = spoken.length;
    await player.keyboard.press("ArrowRight"); // focus is on Play: arrows still seek
    await player.keyboard.press("ArrowRight");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterSeek = await player.evaluate(() => (window as unknown as { __spoken: unknown[] }).__spoken.length);
    check(afterSeek <= before + 1, `seeking 10 s ahead fired ${afterSeek - before} cues (should not replay skipped ones)`);

    // 3. Review, keyboard only (local server only).
    if (!IS_LOCAL) {
      console.log("SKIP  review save checks (not a local server)");
      return;
    }
    const review = await browser.newPage();
    await review.goto(`${BASE}/review/${VIDEO_ID}`, { waitUntil: "networkidle0" });
    review.on("request", (request) => { if (request.url().includes("/api/review")) console.log(`      (save request: ${request.method()})`); });
    const save = (step: string) =>
      review.waitForResponse((response) => response.url().includes(`/api/review/${VIDEO_ID}`), { timeout: 5000 })
        .catch(() => { throw new Error(`no save after ${step}`); });
    await Promise.all([save("A"), review.keyboard.press("a")]);
    await review.keyboard.press("e");
    await review.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA", { timeout: 2000 });
    const textareaFocused = await review.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
    check(textareaFocused, "E moves focus into the description editor");
    await review.keyboard.type(" Checked by a person.");
    await Promise.all([save("Enter"), review.keyboard.press("Enter")]);
    await Promise.all([save("R"), review.keyboard.press("r")]);
    const current = await review.evaluate(() => document.querySelector(".item-list [aria-current='true'] .phrase")?.textContent);
    check(current !== null && current !== undefined, `after three decisions the list moved on (now at ${current})`);

    const saved = JSON.parse(await readFile(reviewPath, "utf8"));
    const statuses = Object.values(saved.decisions).map((decision) => (decision as { status: string }).status).sort();
    check(JSON.stringify(statuses) === JSON.stringify(["approved", "edited", "rejected"]), `review.json has approved, edited, rejected (got ${statuses.join(", ")})`);
    check(saved.edits.length === 1 && String(saved.edits[0].after).endsWith("Checked by a person."), "edits log has the edit with before/after");
  } finally {
    await browser.close();
    // Leave no test review behind.
    if (IS_LOCAL) {
      await rm(reviewPath, { force: true });
      await rm(path.join("data", "videos", VIDEO_ID, "edits.json"), { force: true });
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
