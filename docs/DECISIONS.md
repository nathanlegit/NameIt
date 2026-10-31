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
