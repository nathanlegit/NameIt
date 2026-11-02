# Decisions, reversals and negative results

Dated log. Never delete an entry; add a new one that supersedes it.

---

## 31 Oct 2026: Meta API shapes verified (M0)

Checked against dev.meta.ai docs (quickstart, models, api-reference/voice, sam/*, structured-output, api-reference/responses/schemas) and the cookbook repo (`07_sam/01_api_basics/typescript/sam-api.ts`, `07_sam/03_headlocked_speech_bubble_captions/scripts/transcribe.py`, `01_api_fundamentals/04_structured_output.ipynb`, `07_vision_input.ipynb`).

| PRD assumption | Verified reality | What we did |
|---|---|---|
| Env var `META_API_KEY` | Meta's docs and cookbook use **`MODEL_API_KEY`** | Use `MODEL_API_KEY` (and `MODEL_API_BASE_URL`), so cookbook snippets work unchanged |
| Base URL `https://api.meta.ai/v1` (TODO-VERIFY) | Confirmed | No change |
| Transcribe: "request diarization and turn timestamps" | `POST /v1/asr/transcribe`, multipart (`request` JSON + `audio` WAV). `mode: "DIARIZATION"` gives `turns[{turnId, startMs, endMs, transcript, speaker}]`. Default mode `PUSH_TO_TALK` returns **no turns**. Biasing via `keywords: string[]`. Limits 10 min, 32 MB | `src/meta/transcribe.ts` |
| WAV 16 kHz (verify) | Mono 16-bit PCM WAV at 16 or 24 kHz both accepted. Cookbook uses 24 kHz | Keep **16 kHz**: a 10-minute file is about 19 MB, leaving headroom under 32 MB |
| SAM via Responses API | Confirmed: `POST /v1/responses`, `model: "sam-3.1"`, one user message with `input_text` (noun phrase) + `input_image` / `input_video`. **One concept per request.** Video needs a Files API upload (`purpose: "user_data"`) | `src/meta/sam.ts` |
| SAM returns masks as RLE or PNG | **Neither.** SAM streams a text grammar in `output_text`, with base85 masks and corner boxes (`x1,y1,x2,y2`) in source pixels. Confidence only if `metadata.include_confidence = "true"` | Use Meta's `@meta-sam/parser` (0.1.0) rather than hand-rolling a parser. It gives typed box and mask records and `decodeMaskToRaster` / `decodeMaskToRLE` |
| Spark structured output | Works on Chat Completions with `response_format: {type: "json_schema", json_schema: {name, schema}}`, and the cookbook shows images working there. Responses API uses `text.format` instead. Images must be in a **user** message (a developer message returns 400) | `src/meta/spark.ts` uses Chat Completions. Schemas are written once in zod and converted with `z.toJSONSchema` |

Still TODO-VERIFY (will confirm on the first live run):
- Whether `@meta-sam/parser` 0.1.0 still needs the cookbook's shim that synthesises `response.output_text.done`. Kept for now in `src/meta/sam.ts`; it is harmless if the event already arrives.

## 1 Nov 2026: M3 held-out result (Prelinger films, real narration)

**Protocol.** Two excerpts chosen and labelled by a separate agent working only from the transcript (stages 01 and 02) and the frames, before stages 03 to 09 had ever run on them. Code and prompts were frozen after the scripted run; no change was made after seeing held-out output except the eval's cost message. Labels are drafts and need Nathan's check (four are flagged uncertain in the label files' `trueReferent` text).
- `held-meat`: *How to Buy Meat (Part II)*, USDA, ca. 1970, 234 s. A presenter cuts a blade chuck roast. 26 visual references, 6 decoys.
- `held-watch`: *How a Watch Works*, Jam Handy / Hamilton, 1949, 278 s. Hands assemble a giant watch model. 11 visual references, 9 decoys.
- Rejected films and reasons are in the agent's notes: three for no licence in the metadata, two marked "All Rights Reserved", one for wartime propaganda, several silent or voice-over over wide shots.

**Held-out result: Name It beats the baseline.** These are the headline numbers.

| Metric | Target | Name It | No-grounding baseline |
|---|---|---|---|
| Detection recall / precision | ≥ 80% / ≥ 75% | 86% (32/37) / 100% (0 of 15 decoys) | (same detector) |
| Resolution accuracy | ≥ 70% | **75%** (24/32) | 60% (18/30) |
| Hallucination rate (ready and wrong) | ≤ 10% | **22%** | 41% |
| `ready` precision | ≥ 85% | **78%** (of 18) | 59% (of 27) |
| Abstention rate | 10 to 25% | 0% | 6% |
| Unresolved visual references per minute | lower | 4.3 → **1.5** | 4.3 → 2.2 |
| Cue timing fit | 100% | 100% (2 inline of 36), 0 overlaps | n/a |

All 7 clips: accuracy 79% vs 74%, hallucination 18% vs 25%.

Why Name It wins on real footage, from the per-item list in EVAL.md:
- **It uses the narrator's names.** "the rib eye section", "the less tender part", "the pallet", "the escape wheel". The baseline sees only frames and describes shapes ("a toothed ring", "a raw marbled block"), which the judge marks as not identifying the thing. The glossary and transcript context are doing the work the scripted clips couldn't show, because there the names were rarely said.
- **Its confidence is more useful here.** 14 of 32 answers went to `needs_review`, and 4 of Name It's 8 wrong answers are among them; the baseline put 11 of its 12 wrong answers in `ready`. Still short of target: hallucination 22% vs ≤ 10%.

Failures and negative results on real narration:
- **Long turns break timing.** The meat presenter barely pauses, so silence detection gives 6 turns, the first 141 s long. A reference's time is then a proportional guess inside a 141 s turn, so localisation can land on the wrong moment ("the USDA grade stamps" became "the roast"). All 4 meat detection misses are "this" inside these long turns. Fix for later (not applied, to keep the held-out set clean): split long segments at the quietest points, or use the model's own turn boundaries inside them.
- **No pauses, no inline cues.** All 26 held-meat cues are extended, so the video would pause 26 times in 4 minutes. A viewer setting such as "only pause for ready cues" or a lower pause budget per minute is needed (M4 player).
- **SAM on 1949 stop-motion footage:** 7/10 grounded on the watch film, 22/26 on the meat film. Old footage works, but less reliably than stock footage (58/58 on the scripted clips).
- **Transcription glitches on old audio:** a raw `<|speaker_A|>` token leaked into one watch turn; "palace" for "pallet"; repeated words. None stopped detection.
- **Eval matching for long turns:** many labels share one turn start, so same-phrase labels are paired with candidates in spoken order (k-th label ↔ k-th occurrence), which is now explicit in `src/eval/match.ts` and tested.

Small held-out set (37 references, 2 films): a 15-point accuracy gap is about 5 items. It is a real signal in the expected direction, not a precise number.

## 1 Nov 2026: M3 test set expanded (scripted clips 3 to 5)

Three new scripted clips, built the same way as clip1 and clip2 (Pexels footage, our narration, labels from the script): `clip3` potting and repotting (gardening, 47 s), `clip4` fitting a drill bit and driving a screw (assembly, 55 s), `clip5` origami (crafts, 34 s). Scripted set now: 5 clips, 46 visual references, 15 decoys, 3.8 minutes. A peanut-butter-sandwich clip (Pexels 7254279) was rejected: handheld, hands far from camera, a child's face in shot, referents too unclear to label.

Narration lines closer than about 0.4 s merge into one transcript turn (silence detection needs 0.4 s), which breaks label matching. Lines are now spaced at least 0.5 s apart; the build report flags anything tighter.

**Scripted result (5 clips): Name It and the baseline are tied.** Resolution accuracy 83% (38/46) each; `ready` precision 84% each (Name It 38 ready, baseline 44); detection recall 100%, precision 94% (3 false alarms: "This is the first thing I ever learned"-style lines read as pointing at the current step); cue timing fit 100% (42 inline of 58 cues), 0 overlaps.
- Name It wins on naming and counting: "flour" vs the baseline's "white powder"; "a row of bits" and "the bit" where the baseline named the whole holder.
- The baseline wins on motion and some places: "batter slides from the spatula" vs Name It's "lifts the spatula"; "hands on the stem" vs Name It's "the grey pot".
- Both miss the hard ones: a paper crease ("press right there"), a specific corner ("this corner"), and "those" pointing at finished pieces across the table.
- **Negative result: confidence does not separate right from wrong.** Wrong answers scored 0.85 to 0.99, the same as right ones. The two self-consistency answers usually agree even when wrong, because they share the same misreading of the frame. Name It does send more items to review (8 vs 2), and 2 of its 3 `needs_review` items in the error list were wrong, but that is weak.
- The baseline guesses gender ("She smooths...", "She pinches...") throughout; Name It never does. Not captured by the accuracy metric.
- Unlabelled: the detector also flags anaphoric "it" in sentences like "fold **it** like this" (9 cases on clips 1, 3 and 5). They point at visible things, but they are pronouns, not the deictic words the labels cover, so they are listed in EVAL.md and not counted either way.

Tuning stopped here so the held-out result is honest.

## 1 Nov 2026: M3 (resolve, confidence, cues, first eval)

**First eval, scripted clips only (clip1 + clip2: 18 visual references, 6 decoys, 1.6 minutes).** Full table in `docs/EVAL.md`.

| Metric | Target | Name It | No-grounding baseline |
|---|---|---|---|
| Detection recall / precision | ≥ 80% / ≥ 75% | 100% / 100% | (same detector) |
| Resolution accuracy | ≥ 70% | 89% (16/18) | 94% (17/18) |
| Hallucination rate (ready and wrong) | ≤ 10% | 12% | 6% |
| Abstention rate | 10 to 25% | 0% | 0% |
| Unresolved visual references per minute | lower | 11.6 → 1.3 | 11.6 → 0.6 |
| Cue timing fit | 100% | 100% (14 inline of 20 cues), 0 overlaps | n/a |

**Negative result: grounding does not beat the baseline on the scripted clips.** The difference is one item out of 18, which is noise at this size, but Name It is not ahead. What the errors show:
- Name It's misses are all **actions** ("fold it like this", "falls off like that", "press both sides like that"). Its resolve step looked at one key frame plus the box, and a single frame can't show a movement ("a hand lifts the spatula"). The baseline sees 7 frames over 3 s. Fix tried: resolve now also gets the frame sequence for actions. That fixed "fold" but "falls off" flipped from right to wrong between runs, so treat single items as noisy.
- The baseline's miss is **naming**: "white powder" where the video says flour. The glossary is doing its job there.
- The scripted clips are easy: one presenter, tight close-ups, few distractors, clean audio. A frame sequence is enough to name things there. The held-out real-narration clips are the real test of whether grounding earns its cost.
- **Confidence does not yet separate right from wrong**: every answer is `ready` (0% abstention), including the wrong ones. Weights and thresholds are untuned first guesses; tuning them needs more labelled references than 18.

**Correction to the M2 entry below (bug found by M3's evidence check):** two clip1 overlays (`t4-c6` "this much", `t6-c20` "like that") had SAM's box drawn off the object. SAM was right; the overlay was wrong. Two causes:
1. Evidence was drawn on the nearest 2 fps frame, not on the clip frame SAM boxed. Fix: Stage 06 extracts the exact clip frame (`evidence/<id>.frame.jpg`) and draws on that.
2. The 2 fps frames were about 0.2 s late. ffmpeg's `fps` filter keeps the *last* source frame in each slot, and the default rounding makes the slot for 13.5 s run to 13.75 s. Measured with PSNR: frame "13.5 s" matched the clip frame at 13.7 s (44 dB vs about 22 dB for its neighbours). Fix: `fps=2:round=up`; re-measured within one source frame (0.04 s).

The "checked by eye: 11/11" in M2 was too generous: the boxes were *near* the spoon. Spark's new `evidenceMatches` answer caught it ("green box marks empty background wall above the hand").

Decisions:
- **Self-consistency uses two views, not just two temperatures.** Answer A: key frame + box overlay at temperature 0. Answer B: overlay + close-up crop of the green box at temperature 0.7. Agreement is word overlap divided by the shorter name (`src/lib/names.ts`), so "the walnuts" agrees fully with "the glass jar of walnuts".
- **Confidence formula (`src/lib/confidence.ts`):** 0.5 × Spark's mean confidence + 0.25 × agreement + 0.25 × grounding strength (SAM score and selection margin), + 0.05 for a glossary match (not for "mixture" entries, whose names go stale). Caps: no SAM evidence, or `evidenceMatches` false, means at most 0.70 (`needs_review`). Thresholds as the PRD: 0.75 and 0.45. All untuned.
- **Resolve schema gains `evidenceMatches`** (M0 lesson 2). For actions and states, the prompt says the box marks the thing acted on, not the motion; without that, every action was flagged as a mismatch.
- **The writer and resolver say "the presenter" or "a hand", never he/she** (M0 lesson 5). The PRD 12.6 example's "She tips..." is now "A hand tips...". (The baseline prompt has no such rule and does say "She": another point for Name It's wording, not measured.)
- **Cue placement only uses the gap right before or right after the reference's sentence** (narrows PRD F9 step 1). The first clip2 run put the cue for "drop this in" in a gap after the *next* sentence, so the viewer would hear the descriptions in the wrong order. Otherwise extended. Earlier references claim a shared gap first (DCMP: sequence matters most).
- **The short cue is kind-aware:** the first writer prompt said "usually just the name", which turned "firm it down like this" into "The black weed membrane." Now: name for objects, state for states, place for locations, the movement with its verb for actions.
- **Hyphenated words count as separate words.** With a 1-word budget, Spark wrote "Center-hole." and "Pepper-seedling."; TTS speaks two words. The prompt also says not to do it.
- **WebVTT end times are clipped to the next cue**, since an extended cue's nominal end would otherwise overlap the next cue in the file.
- **Eval judge is Spark (text only), not Wonder.** The judge grades both columns, so any bias applies to both. Nathan's spot-check corrections go in `src/eval/overrides.json`. Wonder (PRD 11.1, "optional") isn't used: its request shape isn't verified and the judge task is simple.
- **Baseline per PRD 13.3:** same detector, same ±1.5 s frames Stage 05 saw, the sentence, one call. No transcript or glossary, so it can't use names said earlier.
- **Two unlabelled visual references:** clip1 "Keep folding **it** like this" and "You want **it** to look like this" (both the batter). The detector found them correctly; the scripts didn't label them. Listed in EVAL.md and not counted.
- **Video status becomes `ready_for_review`** when Stage 09 finishes.

Cost per clip for stages 07 and 09: about $0.40 to $0.80 (two resolve calls + one writer call per reference). Eval: about $0.50 for both clips on a cold cache.

## 31 Oct 2026: M2 (context, detect, localise, ground)

**Result on 2 clips** (clip1 cooking, 65 s; clip2 gardening, 28 s; scripts and expected answers in `scripts/demo-clips/`):

| | clip1 | clip2 |
|---|---|---|
| Scripted visual references found | 11/11 | 7/7 |
| Decoys rejected | 3/3 | 3/3 (including existential "there is") |
| Grounded to the intended object (checked by eye) | 11/11 | 7/7 |
| Stages 03 to 06: time / cost | 134 s / $0.83 (first run) | 81 s / $0.50 |

Still one person's judgement on two scripted clips; the M3 eval makes the measured claim.

Decisions:
- **SAM grounding uses video tracking, not a single frame.** A 3 s, 10 fps clip around the chosen moment (inline base64 `input_video`, no Files API upload). Each concept is tracked with a stable object id, so hand contact is measured over 30 frames and motion (PRD rule 2) is implemented. Verified live first (`spike/probe-sam-video.ts`). Cost $0.01 per concept (50-frame minimum).
- **SAM's raw output text is cached and re-parsed offline** (`parseVideoRawOutput`), so the cache holds exactly what the API returned. Re-parsing gave identical records to the live parse. A trimmed real response is the SAM fixture test.
- **Spark responses are cached by a hash of the exact request** (prompt, schema, temperature, image bytes). A changed prompt or transcript can never serve a stale answer.
- **Selection is tiered:** if SAM finds anything for Spark's specific phrase, only those objects are candidates; the head noun is the fallback. This fixed the M0 wrong-jar case (now a unit test). Then a weighted score: hand contact (weighted by kind: 1.0 object/amount/action, 0.6 state, 0.3 location), motion 0.5, centre 0.3, size 0.2, SAM confidence 0.2. All weights are first guesses, to be tuned on the eval set.
- **F4 window is no longer clamped to the turn** (reverses the PRD detail). With M1's precise turns, "Take a spoon of this" is 1 s long but the spoonful is shown just after it; clamping left Spark two frames, both too early. The window is now ±1.5 s around the estimate, clamped only to the video.
- **The localise prompt gives per-kind guidance and asks for fallback concepts.** First run: "it goes in *there*" was resolved to the bag being moved, not the bowl; "falls off like that" got no box (an 8-word phrase was skipped, and SAM finds nothing for "spatula" covered in batter). Fix: a location means "the place something is put, not the thing moved"; a state means "the container or tool holding the substance"; the phrase is capped at 6 words; up to 2 `alternativeConcepts` are tried only if both main concepts find nothing. Second run: 13/13 grounded, both failures fixed, and fallbacks were never needed.
- **Negative result: SAM struggles with shapeless stuff on its own** ("batter" found nothing). The prompt now steers towards the container or tool holding it.
- **Glossary entries have a `kind`**, with "mixture" marking names that can go stale (the M0 "dry mix" problem). Resolution (M3) will use it.
- **Known limitation:** motion is measured in screen space, so a moving camera inflates it. Fine for steady how-to shots; noted for the eval.

Test set status: 24 labels (18 visual, 6 decoys) from 2 clips, generated from the scripts by `pnpm make-labels` and needing Nathan's read-through. The PRD target is 60 to 100 references from 5 to 8 clips, plus 2 held-out clips never used for tuning. Both clips here have now been used for tuning, so they can't be held out.

## 31 Oct 2026: M1 (skeleton, ingest, transcribe)

- **Transcription is segmented locally (replaces whole-file ENDPOINTING).** Stage 02 runs ffmpeg `silencedetect` (−35 dB, at least 0.4 s), cuts each speech segment (padded 0.15 s each side) and transcribes it alone, 8 at a time. Turn times are the segment bounds, measured from the audio. On clip1: 15 turns for 15 narration lines (whole-file ENDPOINTING gave 5), every start within 0.1 s of where the line was placed, all 15 gaps real.
  - Segments longer than 15 s (continuous speech, or speech over music) fall back to the model's own turns inside the segment.
  - Gaps are computed from turns with words, not from silence, so music with no speech still counts as gap time.
  - Open risk: −35 dB is tuned on clean narration. Prelinger films (hiss) may need a different threshold. Check when the held-out clips are added.
- **Stutter clean-up works:** 4 of 15 segments on clip1 came back stuttered ("Take a a spoon", "that that jar") and all were collapsed. Raw text is kept in `speech_segments.json`.
- **Timing:** a 5-minute video took 2.6 s to ingest (target under 60 s; 600 frames) and 12.8 s to transcribe (72 segments), at about $0.007.
- **`pnpm run pipeline`, not `pnpm pipeline`:** pnpm 12 has a built-in `pipeline` command that takes over the bare form. The PRD's commands should be read with `run`.
- **Videos are registered with `pnpm add-video <file> <id>`**, which copies the file to `data/videos/<id>/source.<ext>` and writes `meta.json`. The M4 upload page will call the same `addVideo()` function.
- **Fixture test** for the Transcribe adapter uses a real response (`src/meta/__fixtures__/transcribe-endpointing.json`). SAM and Spark fixtures come with their stages in M2.

## 31 Oct 2026: M0 gate result: GO (confirmed by Nathan)

Clip: `clip1` (65 s, two Pexels clips, ElevenLabs narration placed per line; spec with expected answers in `scripts/demo-clips/clip1.json`). Report: `data/spike/clip1/spike-report.md`. Cost $0.67, 198 s.

| Check | Result |
|---|---|
| Visual references found (recall) | **11 / 11** scripted references |
| Decoys rejected ("This part is really easy", "That's the dry mix done", "that's the secret") | **3 / 3** |
| Extra candidates classified visual | 3 (each an "it" whose referent is visible: the spoonful, the batter); all resolved correctly |
| Resolved to the right referent (Claude's marking, against the spec) | **11 / 11** scripted, plus 3 / 3 extras |
| SAM box on the right object (checked by eye) | **13 / 14**. The small held spoonful was grounded correctly, which was the top-listed risk |
| Errors | 0, after fixing a missing `mkdir` for the evidence folder |

Gate (at least half right): passed with a wide margin. Caveats: one clip, scripted narration, a single run. This is a feasibility signal, not an accuracy number; the eval in M3 makes the real claim.

### Negative results and lessons (feed into M1 to M3)

1. **Mask selection picked the wrong jar (F5).** For "Keep that jar right there", the hand-touch rule chose a small background jar touching the hand box; the walnut jar (not held) was rejected. SAM's *specific* phrase "small glass jar of walnuts" returned exactly one detection, which was probably the right one. Fix in M2: a detection from the specific noun phrase outranks one from the head noun alone; the hand-touch rule should weigh less for kinds that are rarely held (location, distant objects). Add this case as a unit test.
2. **Spark noticed the bad box but stayed confident (F7).** Its `uncertaintyNote` said the green box was the wrong jar, yet confidence was 0.90. Fix in M3: add `evidenceMatches: boolean` to the resolve schema, and cap combined confidence (needs_review at most) when it's false.
3. **ENDPOINTING merged 0 to 36 s (11 sentences, pauses up to 2.4 s) into one turn,** then split the rest normally. Turn-ending is not a predictable silence rule. The proportional time estimate still landed within about 1.5 s, but only because TTS speaks at an even pace; real speech won't. Fix in M1 (F2): find speech segments locally with ffmpeg `silencedetect` and transcribe each segment separately. That gives reliable sentence-level timing and exact gaps, and also solves the early turn-end issue below. Cost stays negligible.
4. **ASR stutters also occur on clean ElevenLabs audio** ("This This", "Honestly honestly", "to to"), so they come from the model, not the `say` voice. Fix in M1: collapse immediate word repeats before deixis detection.
5. **Resolution wording needs work (F6/F9):**
   - It is too verbose for cues. That's expected: the cue writer (F9) shortens it.
   - It infers gender ("He holds", "She grips"). That breaks rule 5 (observable only). Fix: the prompt should say "the presenter" or "a hand".
   - It reused "the dry mix" for wet batter, because the transcript said "That's the dry mix done" earlier. That's a glossary-timing problem: an entity name should apply only while that state holds. Watch this in M2's glossary.
6. **Speed:** about 200 s per minute of video, with calls one after another. Fine for the spike; parallelise in the pipeline.

## 31 Oct 2026: Transcribe mode is ENDPOINTING, not DIARIZATION (reversal, from live runs)

Tested on `data/spike-input/synthetic.mp4` (macOS `say`, one voice, 1.0 to 1.5 s pauses between sentences), checking against ffmpeg `silencedetect` (-35 dB, at least 0.5 s):

- **DIARIZATION returned one turn for the whole 17 s clip.** It splits on speaker changes, not pauses. For a solo presenter that breaks gap detection (F2/F9) and makes the F4 proportional estimate guess across the whole clip instead of one sentence.
- **ENDPOINTING returned 5 turns, one per sentence.** Boundaries were within about 0.2 s of the real silences. No speaker labels, which no P0 feature needs.
- **Decision:** ENDPOINTING is the default. If a multi-presenter clip ever matters, run DIARIZATION as well and attach speakers by time overlap (cost is negligible at $0.18 per audio hour).

Follow-ups for M1 (F2):
- **Turn ends can come about 0.2 s early** (turn 0 ended at 3.02 s, but the audio is silent only from 3.22 s). A cue at `gap.start + 0.15 s` could clip the last word. Plan: intersect Transcribe gaps with ffmpeg `silencedetect` gaps (local, free) and place cues only inside real silence.
- **Repeated-word stutters in both modes, varying between runs:** "we are are", "add this to this to the bowl" (DIARIZATION), "was was", "this this much" (ENDPOINTING). A stuttered "this this much" produced two candidates for one reference. Plan: collapse immediate word repeats before detection, or merge candidates within a few characters. Unknown whether this comes from the `say` voice or the model; recheck on the ElevenLabs clip.
- **Speed:** about 10 s per Spark call, run one after another (7 classifier calls took about 70 s). Parallelise per-reference calls in the pipeline (rate limit is 3,000 RPM).

The classifier behaved well on this clip: with only colour bars on screen it refused to call any reference visual, and it rejected "this recipe" on linguistic grounds. Reasoning tokens make output 1,000 to 2,800 tokens per call, about $0.013 per classification.

## 31 Oct 2026: spike simplifications (M0 only, revisit in M2)

- **SAM on the single best frame (image mode), not a video clip.** Cheaper and simpler for the gate. Consequence: mask-selection rule 2 ("moved during the window") is not implemented yet; it needs video tracking.
- **Boxes, not masks, in the evidence overlay.** Drawn with ffmpeg `drawbox`. Real mask overlays come with the review UI canvas (M4).
- **Full transcript in place of the glossary** in the resolve prompt. The glossary stage (03_context) is built in M2.
- **Localisation prompt asks for `headNoun` as well as `nounPhraseGuess`.** SAM wants a one or two word concept; asking Spark for it beats guessing the head noun from a phrase with string tricks. (Addition to PRD 12.3's schema.)
- **No self-consistency (second F6 call)** in the spike. That's an M3 feature.

## 31 Oct 2026: tooling

- pnpm 12 via corepack (Node 24.18). TypeScript 7, tsx, zod 4, openai SDK 4.104 (the version the SAM cookbook pins).
