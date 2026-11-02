# PRD: Name It

**Name:** Name It (locked 30 Oct 2026). Tagline: "Presenters say 'this'. Name It says what."
**One-liner:** Name It makes how-to videos usable without sight by working out what "this", "that" and "like this" actually refer to, and saying it.
**Event:** Meta Global AI Developer Hackathon (Cerebral Valley), Indie Developer track
**Owner:** Nathan (solo)
**Doc status:** v1, 30 Oct 2026. Source of truth for the build. Update it when decisions change, and record reversed decisions and negative results rather than deleting them.

---

## 0. Instructions for Claude Code (read first)

This PRD is the spec. Follow these working rules for the whole build:

1. **Work sequentially.** One milestone at a time, in the order in Section 15. Do not start the next milestone until Nathan has run the current one locally and confirmed it works.
2. **Teach before code.** Before implementing each milestone, explain in plain language what concept is being built and why (for example: what an exophoric reference is, how SAM tracking works, how WebVTT cues are timed). Keep it short. Then write the code.
3. **Readable and explicit over clever and compact.** Nathan must be able to reconstruct anything you write. Prefer named intermediate variables, small functions with clear names, and comments explaining *why*. If a more idiomatic version is worth knowing, show it second, not instead.
4. **Do not invent Meta API shapes.** The exact request and response formats for Muse Spark, SAM 3.1 and Muse Voice Transcribe must come from the official docs and cookbook (links in Section 11). If something is not documented, write the call behind a small adapter function, mark it `// TODO-VERIFY`, and tell Nathan what to check. Never guess silently.
5. **Verify every step.** Each milestone ends with a concrete command Nathan can run and an expected output.
6. **Flag scope creep.** If an idea mid-build is not in the P0/P1 scope (Section 6), say so explicitly before doing anything about it.
7. **Hackathon rules are hard constraints** (Section 2.3): the repo is public, all work is new, no secrets committed, no third-party video files committed.
8. **Record negative results.** If an approach fails (for example, SAM cannot segment small held objects reliably), write it in `docs/DECISIONS.md` with what was tried and what replaced it.

---

## 1. Summary

Blind and low-vision (BLV) people watch a lot of online video, mostly by ear, using screen readers. How-to videos (cooking, repair, crafts, DIY) are among the worst for them, because presenters constantly say things like "add this", "put that here", or "mix until it looks like this" while showing rather than saying. The audio track is useless at exactly the moments that matter.

Existing tools either **flag** these moments without resolving them (CrossA11y), or **describe scenes generally** (AI audio description tools), which reviewers repeatedly criticise as too generic about tools and steps in how-to videos. Nobody resolves the reference itself to a specific, grounded object or state with evidence.

Name It does exactly that:

1. Transcribes the video and finds the visual references in speech.
2. Locates the moment and segments the object being held, pointed at or acted on (SAM 3.1).
3. Names it specifically using context from the whole video (Muse Spark), for example "add this" becomes "add the two cups of flour".
4. Reads out on-screen text that is never spoken (amounts, temperatures).
5. Attaches evidence (frame, mask, confidence) to every claim, and abstains rather than guesses.
6. Lets a sighted volunteer approve or fix each item in seconds.
7. Plays it back in an accessible player, timed to fit the gaps in dialogue or pausing the video when there is no gap.

---

## 2. Hackathon context and constraints

### 2.1 Key dates (all converted to London time)

| Event | ET (official) | London |
|---|---|---|
| Building period | Oct 27 to Nov 4 | Oct 27 to Nov 5 |
| Discord office hours (weekdays, text only, #office-hours) | 10:00 to 11:00 AM | 15:00 to 16:00 (after US clocks change on 1 Nov) |
| Last full day for submission questions | Tue Nov 3 | Tue Nov 3 |
| **Submission deadline** | **Wed Nov 4, 9:00 PM ET** | **Thu Nov 5, 02:00** |
| Judging | Nov 5 to 8 | Nov 5 to 8 |
| Closing ceremony, top 10 (5 per track) | Mon Nov 9, 12:00 PM | Mon Nov 9, 17:00 |

**Working deadline: Wednesday 4 Nov, 20:00 London.** The remaining hours are buffer for upload problems. (Lecture Lens was submitted a minute late because the video file was too big. Export and test-upload the demo video by Wednesday afternoon.)

### 2.2 Problem statement

The project must fit one of the two problem statements:
- **Build for Your World:** "Bring Meta's models into your domain. Solve a problem you know firsthand, free up time and mental space, and make something possible that wasn't before."
- **Push the Frontier:** "Use Meta's models to tackle challenges in software, robotics, manufacturing, energy, materials and beyond. Give a machine a new capability..."

**Proposed: Build for Your World**, framed as "make something possible that wasn't before": following a how-to video without seeing it. *Decision for Nathan* (Section 17): confirm the framing, or pick Push the Frontier ("give a video player a new capability").

### 2.3 Rules (hard constraints)

- **Public repo.** No API keys or secrets ever committed. Use `.env.local` plus `.gitignore`, and provide `.env.example`.
- **New work only.** Everything was built during the hackathon. No code copied from Lecture Lens or sourcecheck. The README must state clearly what was built during the hackathon.
- **Demo shows only what was built during the hackathon.** Failing to make this clear means disqualification at the judges' discretion.
- **No assets without rights.** Third-party video is not committed to the repo. Use a download script plus a `CREDITS.md` with licence and attribution for every clip.
- **Must use Meta models** (Model API and/or open weights). Stage One pass/fail checks for reasonable use.
- **Submission:** via the Cerebral Valley platform. Public repo link, **3-minute demo video**, and a live product link if possible.
- Team size: solo.

### 2.4 Anti-projects list, and why Name It is clear of it

The organisers list generic or disallowed projects: medical advice, basic RAG apps, simple image analyzers, simple "AI for Education" chatbots, AI job application screeners, AI nutrition coaches, personality analyzers, sports analyzers or coaches, anything political or involving war.

- **Not a simple image analyzer:** the core is cross-modal reasoning over speech plus video over time (which object, at which moment, does a spoken word refer to), with segmentation evidence and abstention.
- **Not an education chatbot:** no chat interface. It produces an audio description track and a review workflow.
- **Not medical:** accessibility of everyday how-to content. No health advice. **Avoid health or fitness demo videos** so nobody misreads it.
- **Not basic RAG:** no retrieval-over-documents product.

### 2.5 Judging rubric (Stage Two, 0 to 10 per criterion) and how Name It targets it

| Criterion | Weight | Judges ask | How Name It scores |
|---|---|---|---|
| Impact | 30% | Real-world potential, who benefits, could people actually use it, fits a problem statement | Research-backed problem (Section 3): huge supply gap in audio description (about 7% of requested YouDescribe videos are described), and visual references are a measured predictor of inaccessibility. Clear beneficiaries (BLV viewers) and operators (volunteer describers). Credible path to adoption: plugs into the volunteer workflow that already exists. |
| Use of Meta AI Tooling | 25% | Creative, beyond basic integration, "surprised even us" | Three Meta models each doing core work: Voice Transcribe (dialogue, gaps), SAM 3.1 (open-vocabulary segmentation and tracking of the referenced object), Muse Spark (whole-video context, naming, writing). The unusual part: using SAM masks as **evidence** for language claims, so speech is grounded to pixels. |
| Technical Depth and Execution | 20% | Sound engineering, real craft | A real pipeline with a measured evaluation: hand-labelled test set, resolution accuracy, abstention and hallucination rates, cue timing fit. Honest negative results. |
| Demo | 25% | Working, impressive, holds up live, video cool to watch | The "close your eyes" moment (Section 14): the judge hears "add this" and gets nothing, then hears Name It resolve it. Mask overlays make the AI's reasoning visible. Live deployed viewer. |

Stage Three (top 5 per track): judges watch the demo videos live and re-rank on the same rubric. **The demo video is the most important artifact.**

---

## 3. Problem and evidence

All numbers below come from the sources in Section 19. Use them in the README and the demo. Do not inflate them.

### 3.1 How BLV people watch online video today

- BLV viewers use screen readers (VoiceOver, NVDA, JAWS) to navigate, then **listen**. In a 2024 study (85 surveyed, 15 interviewed), YouTube was the most-used platform (83.5% of respondents), and mobile phones the most-used device (90.6%). [S2]
- Workarounds: reading comments for context, asking creators in live chat, family describing videos in advance, pointing image-recognition apps at the screen. [S2]
- BLV participants judge a video by whether it is understandable from its audio. They use trial and error, clicking and abandoning inaccessible videos (9 of 12 participants in formative interviews). [S1]

### 3.2 What makes a video inaccessible (Liu et al., CHI 2021) [S1]

Five factors significantly predicted perceived accessibility in a regression on BVI ratings (adjusted R² = 0.64): % non-speech (about 40% of explained contribution), visual references (about 17%), shot-change rate (about 16%), % visual entities not mentioned in speech (about 16%), low-information speech (about 11%).

- **Visual references** ("look at this", "check it out"): median **2.46 per minute** across 55 videos, up to **13.8 per minute**.
- **% of visual entities never mentioned in speech:** median **79%**.
- **Undescribed on-screen text:** median 5.16 per minute. It was not a significant predictor in the regression, but **all 8 user-study participants asked for on-screen text information**, and the formative study called out recipe amounts shown on screen but not spoken.
- Embedded descriptions were "especially important" for how-to content such as repair and crafts.

### 3.3 Supply gap

- YouDescribe (Smith-Kettlewell, since 2013) is the main volunteer audio description service for YouTube and TikTok. It has about **3,000 volunteer describers**, yet **only about 7% of requested videos have audio descriptions**. [S9]
- YouTube supports creator-uploaded descriptive audio tracks, but only for creators with access to advanced features, and the creator must produce the whole track. [S11]

### 3.4 What BLV viewers want and do not want from AI

- **Open to AI for user-generated content** (TikToks, Reels, how-tos, family videos), **not for professionally produced content** like films. [S2]
- For how-to videos they want **precise actions and equipment, step-by-step detail**. [S2]
- Some dislike robotic text-to-speech. In Describe Now, **description quality mattered more than voice quality**, and **9 of 20 wanted faster speech**. [S5]
- Describe Now (20 BLV participants): **on-demand description was preferred for instructional, cooking and workout videos** (9 participants), pre-recorded AD for entertainment (6). Concise requests outnumbered detailed ones (mean 5.42 vs 3.58 per session). AI negatives: **lack of step-by-step guidance for instructional content**, hallucinations (**"pork ribs" described as "chicken"**), omitted on-screen text, irrelevant background detail. [S5]
- Trust: some participants trusted AI descriptions less than human ones. Researchers warn about bias and misinformation from unregulated automatic description. [S2, S5]

### 3.5 What AI audio description gets wrong today (ADx3, 2026) [S4]

Seven accessibility consultants rated AI-generated descriptions (Qwen2.5-VL, Gemini 1.5 Pro, GPT-4o) on 10 YouTube videos including How-to & Style (210 evaluations):
- Lowest-scoring content dimension: **Prioritization** (3.43 to 3.76 out of 5).
- Lowest delivery dimensions: **strategic delivery method** (inline vs extended) and **track placement / timing**.
- Reported issues: superfluous description, narrating what dialogue already says, descriptions too early or cutting into dialogue mid-word, and **"generic tool and step descriptions in how-to videos."**
- Expert edits added **specific tools and spatial landmarks** and moved cues to match on-screen events. The consultant called AI drafts "good but not elegant", lacking "that last 10%".

### 3.6 Why this specific gap is open

CrossA11y (UIST 2022) detects visual segments not covered by audio, but **"does not identify what a referent like 'this' points to."** Its paper's own failure example is a recipe host saying mix "until it looks like this": the system treats it as matched and cannot tell the batter's state is undescribed. [S3]

**Name It's thesis:** resolving visual references in how-to videos, grounded with segmentation evidence, is a measured, unsolved, high-value slice of the audio description problem, and it maps directly onto Meta's unusual capability (open-vocabulary video segmentation).

---

## 4. Competitive landscape and positioning

| Work | What it does | Relationship to Name It |
|---|---|---|
| **CrossA11y** (Adobe/UIST 2022) [S3] | Flags visual and audio segments not covered by the other modality. High recall (visual F1 0.81) | Flags but does not resolve "this". Name It resolves it. Cite as prior art. |
| **YouDescribe / YouDescribeX / ADx3** [S4, S9] | Volunteer platform, now with AI drafts that humans edit | Name It is complementary: a specialised draft generator for how-to references that volunteers review. Position as "plugs into this workflow". |
| **Describe Now** (DIS 2025) [S5] | On-demand concise/detailed descriptions (GPT-4V, pre-generated) | Validates on-demand delivery for instructional video. Name It adds grounding and specificity. |
| **VideoA11y** (2025) [S6] | Guideline-prompted AD (42 instructions), 40K dataset. BLV users preferred it in 90% of cases over novice annotations | Adopt the lesson: guidelines in the prompt measurably improve quality. VideoA11y descriptions are not timed to gaps; Name It's are. |
| **SPICA** (CHI 2024) [S7] | Object-level interactive exploration of video frames via segmentation. Improved understanding (6.11 vs 4.79 out of 7) and immersion | Shows object segmentation helps BLV understanding. Used closed-set Mask R-CNN (80 COCO classes). SAM 3.1's open-vocabulary segmentation is the direct upgrade. |
| **Vid2Coach** (UIST 2025) [S8] | Turns how-to videos into a live task coach on smart glasses; 58.5% fewer errors in a BLV cooking study | **Closest competitor.** Different product: coaches you *while you do the task*. Name It makes the *video itself* accessible for anyone watching. Always state this distinction. |
| **ViddyScribe** (commercial) [S10] | Gemini-based real-time AD for YouTube | General description, nothing specific on how-to references. Do not compete on "describe any video". |
| **CoSight** (UIST 2025) [S12] | Prompts sighted YouTube commenters to write timestamped descriptive comments, nudging them to replace "this" with concrete detail | Confirms the "this" problem is recognised. Human-sourced; Name It automates the draft. |

**Positioning statement (use in the README and the demo):**
> AI audio description tools describe scenes. How-to videos fail blind viewers at a more specific point: when the presenter says "this". Name It resolves those references to the exact object or state on screen, shows its evidence, and says so when it is not sure.

**Things we will NOT claim:** that we replace professional describers; that blind users validated it (they did not, and the README says so); that it works on films (BLV users do not want AI there).

---

## 5. Users

### 5.1 Primary beneficiary: BLV viewer
- Watches how-to videos on phone or laptop with a screen reader.
- Wants: specific names of tools, ingredients, parts and amounts at the moment they matter; minimal interruption; control over pace.
- Does not want: generic scene narration, talking over the presenter, confident wrong answers.

### 5.2 Primary operator (MVP): volunteer describer (YouDescribe-style)
- Sighted. Wants to make a video accessible quickly.
- Pain: writing descriptions from scratch is slow, and there are many more requests than volunteers.
- Wants: a good draft, visible evidence for each claim so checking is fast, easy edits, then publish.

### 5.3 Secondary: creator
- Wants to make their own how-to video accessible before publishing. The same review flow works. Not targeted in the demo.

### 5.4 Jobs to be done
- *As a BLV viewer*, when a presenter says "add this", I want to hear what "this" is, so I can follow the step without a sighted helper.
- *As a describer*, when I get a 5-minute how-to video, I want the references drafted and evidenced, so I can publish in minutes, not an hour.

---

## 6. Scope

### P0 (must ship by Wednesday; the demo depends on these)
- **F1 Ingest:** local video file in (mp4/webm/mov, up to 10 minutes). Audio extraction and frame sampling.
- **F2 Transcription:** Muse Voice Transcribe to speaker turns with timestamps; compute dialogue gaps.
- **F3 Reference detection:** find candidate deictic phrases and classify them as visual (exophoric) vs non-visual.
- **F4 Moment localisation:** narrow each reference to a time window inside its turn.
- **F5 Grounding:** SAM 3.1 segments the referenced object in that window; store evidence (frame, mask, box, score).
- **F6 Naming / state description:** Muse Spark produces a specific name or state description using whole-video context.
- **F7 Confidence and abstention.**
- **F9 Cue writing and timing:** gap-fitted cues following DCMP rules; inline or extended. Output JSON plus WebVTT.
- **F10 Review UI:** approve, edit, reject each item with frame and mask overlay.
- **F11 Accessible player:** plays video with description cues via browser TTS, ducking, extended pauses, keyboard controls.
- **F13 Evaluation harness:** labelled test set, metrics script, results shown in the app.

### P1 (only if P0 is solid by Monday night)
- **F8 On-screen text extraction** (amounts, temperatures) read out when not spoken. *(Strongly recommended; promote to P0 if the grounding spike goes smoothly. All BLV participants in [S1] asked for it.)*
- **F12 On-demand "what is this?" key:** describe the most recent reference or the current frame on request (validated by [S5]).
- Glossary panel: entities detected across the whole video (tools, ingredients) with first-seen times.
- Speech rate setting persisted per viewer.
- **F11b Pre-rendered description voice (ElevenLabs):** render each approved cue to an audio clip and play that instead of browser TTS, with browser TTS as fallback. Evidence: some BLV participants disliked robotic TTS voices [S2, S5]. Do this before the demo is recorded if at all possible; it makes the "close your eyes" payoff sound professional.

### P2 (stretch; probably not this hackathon)
- Word-level alignment via a local forced aligner.
- Browser extension for YouTube.
- Export descriptive audio file (mixed WAV) for YouTube upload.

### Explicit non-goals (say no if they come up)
- General scene description of any video (crowded, and not our thesis).
- Live or real-time processing, or a smart glasses coach (Vid2Coach territory).
- Chat or Q&A interface over the video.
- Film or entertainment content.
- Accounts, auth, multi-user collaboration, payments.
- Mobile app.
- Spatial audio or tactile output (SPICA territory).

---

## 7. User flows

### 7.1 Describer flow (the core flow in the demo)
1. **Upload.** Choose a video file. Optional: title, and domain hint ("cooking", "bike repair") used for transcription keyword biasing.
2. **Processing.** A progress view shows pipeline stages (Extracting, Transcribing, Finding references, Grounding, Writing, Done) with counts ("14 visual references found").
3. **Review queue.** A list of items in timeline order. Each item shows:
   - Transcript context (the sentence with the reference highlighted).
   - Evidence frame with the SAM mask overlay and box. Scrub ±1 second.
   - Proposed cue text, type (`object` | `state` | `onscreen_text` | `location`), confidence badge, delivery mode (inline / extended).
   - Buttons: **Approve (A)**, **Edit (E)**, **Reject (R)**, **Next (J) / Prev (K)**.
   - Abstained items show "Name It wasn't sure", with top candidates, so the reviewer can pick one or type.
4. **Publish.** Approved cues are saved. The video gets a shareable viewer link.

### 7.2 Viewer flow (BLV user)
1. Opens viewer link. Page title and controls are screen-reader friendly. Focus starts on Play.
2. Presses **Space** to play. Video audio plays normally.
3. At an inline cue, the TTS speaks it in the dialogue gap while video volume ducks to about 30%.
4. At an extended cue (no gap long enough), the video pauses, the TTS speaks, and playback resumes automatically.
5. Keys: **Space** play/pause; **D** repeat last description; **T** read latest on-screen text (P1); **W** "what is this?" on-demand (P1); **[ / ]** speech rate down/up; **M** toggle descriptions on/off; **← / →** seek 5s.
6. Each spoken cue is also written to an `aria-live="polite"` region so screen-reader and Braille-display users get it too.

### 7.3 Accessibility requirements for Name It's own UI (non-negotiable; judges will notice)
- Full keyboard operation, visible focus, logical tab order.
- All controls labelled; status updates via `aria-live`.
- WCAG 2.1 AA colour contrast in the viewer and review UI.
- Test the viewer with VoiceOver (macOS: Cmd+F5) at least once before recording the demo. Mention this in the README.

---

## 8. Functional requirements and acceptance criteria

### F1 Ingest
- Accept mp4/webm/mov up to 10 minutes and 500 MB. Reject others with a clear message.
- Extract mono 16 kHz WAV audio via ffmpeg (verify the format Transcribe expects).
- Sample frames at **2 fps** to JPEG for Spark context and the review UI. Separately, keep the original video for SAM video requests.
- Store under `data/videos/<videoId>/`.
- **Acceptance:** a 5-minute clip produces `audio.wav`, about 600 frames, and `meta.json` (duration, fps, resolution) in under 60 seconds locally.

### F2 Transcription
- Call **Muse Voice Transcribe** batch endpoint (`POST /v1/asr/transcribe`). Request diarization and turn timestamps. Pass keyword biasing terms from the domain hint (for example cooking utensils).
- **Known limitation:** turn-level timestamps only, **no word-level timestamps**. Design around it (F4).
- Compute **gaps**: intervals with no speech of at least 1.0 s. Store start, end, duration.
- **Acceptance:** `transcript.json` with turns `{id, speaker, start, end, text}` and `gaps.json`. Spot-check 3 turns against the video by ear.

### F3 Reference detection
**Concept (teach this first):** In linguistics, *deixis* means words whose meaning depends on context ("this", "here", "now"). A reference is **exophoric** when it points to something in the physical scene ("add *this*" while holding a bowl), and **anaphoric** when it points back to earlier speech ("*this* recipe is my grandma's"). Only exophoric references are inaccessible to a blind viewer. Name It must tell them apart.

- **Stage A, lexical candidates (deterministic):** regex over turn text for: `this, that, these, those, here, there, like this, like that, this one, that one, this much, this way, right here, over here, it` (treat `it` as low priority; include only when the turn also contains a visual verb). Keep the character offset of each match.
- **Stage B, classification (Muse Spark, structured output):** for each candidate, send the turn text, the previous and next turn, and 4 frames spanning the turn. Ask for `{isVisualReference: boolean, referenceKind: "object" | "state" | "location" | "amount" | "action", reason: string}`.
- **Acceptance:** on the labelled test set, detection precision ≥ 0.75 and recall ≥ 0.80 (recall matters more: a missed reference stays inaccessible; a false positive costs the reviewer one keypress).

### F4 Moment localisation (working around turn-level timestamps)
- **Step 1, proportional estimate:** estimate the word's time by its character position in the turn: `t_est = turn.start + (charOffset / turn.text.length) * (turn.end - turn.start)`. Window = `t_est ± 1.5 s`, clamped to the turn.
- **Step 2, visual refinement (Muse Spark):** send the 2 fps frames in the window (about 6 frames) plus the sentence. Ask which frame best shows the referent being held, pointed at or acted on. Return `bestFrameIndex` and a short noun-phrase guess (for example "small glass bowl of white powder").
- Record both the estimate and the refined time; the eval reports how often refinement moved it.
- **Acceptance:** for ≥ 80% of test references, the chosen frame visibly contains the referent (judged by Nathan).

### F5 Grounding with SAM 3.1
**Concept (teach this first):** SAM 3.1 takes an image or a video plus a short noun phrase ("bowl", "screwdriver") and returns masks and boxes for every match, tracking them across video frames. It does not know which bowl the presenter means; that is Name It's job.

- **Candidate prompts:** the noun-phrase guess from F4 step 2, its head noun ("bowl"), plus `"hand"`.
- Send a short video clip (window ±1.5 s; note the 50-frame minimum billing per video request) or the best frame as an image. Pick whichever the docs support better for this case (`TODO-VERIFY`).
- **Selecting the referent among multiple masks (heuristic, explicit and explainable):**
  1. Prefer masks that overlap or touch a hand mask (hand-object interaction).
  2. Then prefer masks that move or change during the window (the thing being acted on).
  3. Then prefer masks nearest the frame centre, then largest.
  Log the score of each rule so the reviewer UI can show *why* it picked that mask.
- For `state` references ("until it looks like this"), segment the container or contents and store the crop for F6.
- Store evidence: frame path, mask (RLE or PNG), box, SAM score, selection reasons.
- **Acceptance:** evidence overlay renders correctly in the review UI; on the test set, the selected mask covers the true referent in ≥ 70% of grounded cases.

### F6 Naming and state description (Muse Spark)
- **Whole-video context pack** (built once per video, cached): full transcript; glossary of entities named anywhere in the video (built by one Spark call over the transcript plus about 20 keyframes: `{name, aliases, firstSeen}`); on-screen text found (F8 if built).
- **Per reference:** send the context pack, the sentence, the best frame, the masked crop, and the mask selection reasons. Ask for:
  - `object`/`amount`: the most specific accurate name, preferring names the presenter uses elsewhere (glossary). Example: "the two cups of flour", not "white powder".
  - `state`: an observable description, no inference ("thick and glossy, falling in ribbons from the whisk").
  - `location`: a spatial description relative to obvious landmarks ("onto the front left burner").
- Output schema: `{resolvedText, specificity: "specific" | "generic", usedGlossaryEntry: string | null, confidence: 0-1, uncertaintyNote: string | null}`.
- **Acceptance:** on the test set, ≥ 70% of non-abstained resolutions judged correct; hallucination rate (confident and wrong) ≤ 10%.

### F7 Confidence and abstention
**Concept:** a wrong confident description is worse than none (the "pork ribs as chicken" problem). Name It's design principle is evidence before claims, the same idea as sourcecheck: if a claim can't be grounded, flag it instead of stating it.

- Combine signals into a final confidence:
  - SAM mask score for the selected mask.
  - Selection margin (how clearly rule 1/2/3 separated the top mask from the next).
  - Spark self-reported confidence.
  - **Self-consistency:** run F6 twice at different temperature or with a different frame; if the names disagree, lower confidence.
  - Glossary agreement: the resolved name matches a glossary entry (boost).
- Thresholds (tune on the test set, record the final values in `docs/DECISIONS.md`): **≥ 0.75** auto-draft as `ready`; **0.45 to 0.75** `needs_review` (highlighted); **< 0.45** `abstain`: no cue text, show top candidates to the reviewer.
- In the viewer, unreviewed abstentions are never spoken.
- **Acceptance:** eval reports precision of the `ready` bucket; target ≥ 85%.

### F8 On-screen text (P1, recommended)
- Run Spark on keyframes (scene changes plus every 3 s) asking for visible text that conveys task information (amounts, temperatures, times, part numbers, step titles). Ignore logos and watermarks.
- Drop any text already spoken within ±5 s (fuzzy match against the transcript).
- Create cues of type `onscreen_text`, read as "On screen: 180 degrees, 25 minutes."
- **Acceptance:** recall ≥ 70% on labelled on-screen text in the test set.

### F9 Cue writing and timing
**Concept:** audio description has to fit around the presenter's speech. Speech runs at about 2.5 words per second at a normal TTS rate, so a 2-second gap fits about 5 words. When the gap is too short, *extended description* pauses the video.

- Writer (Spark) produces, per resolved reference, a **short** cue (≤ words budget) and a **long** cue (≤ 25 words), following the DCMP rules in Section 12.
- **Placement algorithm (deterministic, explicit):**
  1. Find the nearest gap that starts within 3 s **before or after** the reference time (DCMP: describe before the content when possible; ADx3: cues too early or too late are a top complaint).
  2. `budgetWords = floor((gap.duration - 0.3) * wordsPerSecond)` where `wordsPerSecond = 2.5 * speechRate`.
  3. If the short cue fits: `inline` at `gap.start + 0.15 s`.
  4. Else: `extended`, which pauses the video at the end of the reference's turn and speaks the long cue.
  5. Never overlap two cues. If gaps collide, merge cues or move the lower-priority one to extended.
- Output `cues.json` and `descriptions.vtt` (WebVTT, `kind="descriptions"`).
- **Acceptance:** 100% of inline cues end before the next speech turn starts (automated check in eval); no overlapping cues.

### F10 Review UI
- Route: `/review/[videoId]`.
- Layout: left, item list with status chips; centre, video or frame with mask overlay (canvas) and ±1 s scrub; right, transcript context, proposed text (editable), confidence, selection reasons, delivery mode.
- Keyboard: A approve, E edit (focus textarea), Enter save, R reject, J/K next/prev, Space play the 5 s around the item, P preview the cue with TTS.
- Log each edit `{itemId, before, after, timestamp}` to `edits.json`. The eval can report "% of drafts approved unchanged" as a describer-effort metric.
- **Acceptance:** Nathan can review a 5-minute video's items entirely by keyboard in under 5 minutes.

### F11 Accessible player
- Route: `/watch/[videoId]`. Uses only approved cues (plus `ready` cues if the video was published in "auto" mode for the demo; label this clearly).
- HTML `<video>` plus a custom scheduler that watches `currentTime` (requestAnimationFrame or timeupdate) and fires cues.
- Voice, in order of preference:
  1. **Pre-rendered ElevenLabs audio per cue (F11b, P1).** Generated at publish time by `scripts/render-cue-audio.ts`, stored as `data/videos/<id>/cue-audio/<cueId>.mp3`, played via an `<audio>` element. Speed control via `audio.playbackRate` (0.8 to 2.0). Re-render a cue whenever its text is edited.
  2. **Fallback: Web Speech API `speechSynthesis`.** Used when a cue has no rendered audio. Pick a good available English voice; rate adjustable 0.8 to 2.0 (users wanted faster speech [S5]).
- Ducking: lower `video.volume` to 0.3 while speaking, restore on `onend`.
- Extended cues: `video.pause()`, speak, `video.play()` on `onend`.
- Mirror each cue into an `aria-live="polite"` region.
- Keys as in 7.2.
- **Acceptance:** with the screen off (or eyes closed), Nathan can follow the demo recipe step by step.

### F13 Evaluation harness (P0; this is the Technical Depth score)
See Section 13.

---

## 9. Data model (TypeScript)

```ts
// src/types.ts
export type Seconds = number;

export interface VideoMeta {
  id: string;
  title: string;
  domainHint: string | null;      // e.g. "cooking", used for keyword biasing
  sourcePath: string;
  durationSec: Seconds;
  fps: number;
  width: number;
  height: number;
  licence: string;                 // e.g. "Pexels License" or "CC BY 4.0"
  attribution: string;             // credit line for CREDITS.md
  status: "uploaded" | "processing" | "ready_for_review" | "published" | "failed";
}

export interface Turn {
  id: string;
  speaker: string;
  start: Seconds;
  end: Seconds;
  text: string;
}

export interface Gap {
  start: Seconds;
  end: Seconds;
  durationSec: Seconds;
}

export type ReferenceKind = "object" | "state" | "location" | "amount" | "action";

export interface ReferenceCandidate {
  id: string;
  turnId: string;
  phrase: string;                  // e.g. "this", "like this"
  charOffset: number;
  isVisualReference: boolean;      // from F3 stage B
  kind: ReferenceKind | null;
  classifierReason: string;
}

export interface LocalisedReference {
  referenceId: string;
  estimatedTime: Seconds;          // proportional estimate (F4 step 1)
  refinedTime: Seconds;            // after visual refinement (F4 step 2)
  bestFramePath: string;
  nounPhraseGuess: string;
}

export interface MaskEvidence {
  framePath: string;
  maskPath: string;                // PNG mask, or RLE stored in JSON
  box: [number, number, number, number]; // x, y, w, h in pixels
  samScore: number;
  selectionReasons: string[];      // e.g. ["touches hand", "moved during window"]
  selectionMargin: number;
}

export interface Resolution {
  referenceId: string;
  resolvedText: string | null;     // null when abstained
  specificity: "specific" | "generic" | null;
  usedGlossaryEntry: string | null;
  confidence: number;              // combined 0-1 (F7)
  bucket: "ready" | "needs_review" | "abstain";
  topCandidates: string[];         // shown to reviewer when abstained
  evidence: MaskEvidence | null;
}

export interface OnScreenText {
  id: string;
  time: Seconds;
  text: string;
  alreadySpoken: boolean;
}

export interface Cue {
  id: string;
  sourceType: "reference" | "onscreen_text";
  sourceId: string;
  start: Seconds;
  shortText: string;
  longText: string;
  delivery: "inline" | "extended";
  reviewStatus: "draft" | "approved" | "edited" | "rejected";
  finalText: string | null;
}

export interface ReviewEdit {
  cueId: string;
  before: string;
  after: string;
  at: string;                      // ISO timestamp
}

export interface EvalReferenceLabel {
  videoId: string;
  time: Seconds;                   // approximate time of the spoken reference
  phrase: string;
  isVisual: boolean;
  trueReferent: string;            // human label, e.g. "the bowl of sugar"
  acceptableAlternatives: string[];
}
```

---

## 10. Architecture

### 10.1 Stack
- **TypeScript everywhere. React for UI.** (Nathan's usual stack.)
- **Next.js (App Router)** for the review UI, viewer and API routes, in one repo.
- **Pipeline as Node scripts** run locally (`pnpm pipeline <videoId>`), not inside serverless functions. ffmpeg and long API sequences do not belong in Vercel functions.
- **Storage:** local filesystem, JSON per stage, under `data/videos/<id>/`. No database for the hackathon; JSON is inspectable and easy to debug. *(If concurrency becomes a problem, SQLite via better-sqlite3 is the upgrade. Not expected.)*
- **ffmpeg** via `child_process.spawn` with explicit arguments (more readable than fluent-ffmpeg; Nathan can see exactly what runs).
- **Validation:** `zod` schemas for every model response; on parse failure, retry once with the error message, then fail loudly.
- **Deployment for "holds up live":** precompute demo videos locally, then deploy the Next.js app plus the processed `data/` artifacts (minus source video if licensing requires; host clips per their licence) to **Vercel**. The live link shows the review UI and the player working on real processed videos. Uploading new videos on the live site is disabled ("demo mode") unless time allows.

### 10.2 Pipeline stages (each writes a file; each can re-run independently)

```
video.mp4
  └─ 01_ingest        → audio.wav, frames/*.jpg, meta.json
  └─ 02_transcribe    → transcript.json, gaps.json          [Muse Voice Transcribe]
  └─ 03_context       → glossary.json, keyframes.json       [Muse Spark]
  └─ 04_detect        → references.json                     [regex + Muse Spark]
  └─ 05_localise      → localised.json                      [Muse Spark]
  └─ 06_ground        → evidence/*.png, grounding.json      [SAM 3.1]
  └─ 07_resolve       → resolutions.json                    [Muse Spark x2 for self-consistency]
  └─ 08_onscreen (P1) → onscreen.json                       [Muse Spark]
  └─ 09_cues          → cues.json, descriptions.vtt         [Muse Spark writer + deterministic placement]
```

Each stage: `src/pipeline/NN_name.ts` exporting `run(videoId: string): Promise<void>`. Skip a stage if its output exists, unless `--force`. Log stage timing and API cost estimate to `run_log.json`.

### 10.3 Repo structure

```
name-it/
  README.md                 # what it is, what was built during the hackathon, how to run, eval results, limitations
  CREDITS.md                # every demo clip: source URL, creator, licence, attribution
  .env.example              # META_API_KEY=, META_API_BASE_URL=
  docs/
    PRD.md                  # this file
    DECISIONS.md            # decisions, reversals, negative results (dated)
    EVAL.md                 # eval method and latest results table
  scripts/
    download-demo-clips.ts  # fetches clips from their sources; never commit the videos
    build-demo-clip.ts      # stock clips + narration script -> ElevenLabs narration -> ffmpeg mix -> mp4
    render-cue-audio.ts     # approved cues -> ElevenLabs mp3 per cue (F11b)
  narration/
    <clipId>.txt            # timestamped narration scripts (Section 14.4); committed
  src/
    types.ts
    tts/
      elevenlabs.ts         # the ONLY place ElevenLabs API shapes live
    meta/                   # thin adapters, one per model; the ONLY place API shapes live
      client.ts
      spark.ts
      sam.ts
      transcribe.ts
    pipeline/
      01_ingest.ts ... 09_cues.ts
      run.ts                # CLI entry: pnpm pipeline <videoId> [--from 05] [--force]
    prompts/                # prompt templates as plain .ts string builders, one file per prompt
    lib/
      ffmpeg.ts
      gaps.ts
      placement.ts          # F9 placement algorithm, pure functions, unit tested
      maskSelection.ts      # F5 heuristic, pure functions, unit tested
      confidence.ts         # F7 combination, pure functions, unit tested
    eval/
      labels/*.json         # EvalReferenceLabel[] per video
      runEval.ts
  app/                      # Next.js routes
    page.tsx                # upload + video list
    review/[videoId]/page.tsx
    watch/[videoId]/page.tsx
    eval/page.tsx           # renders latest eval results (for the demo)
  data/                     # gitignored except processed demo artifacts if licence allows
```

### 10.4 Testing
- Unit tests (Vitest) for pure logic: `placement.ts`, `maskSelection.ts`, `confidence.ts`, `gaps.ts`, deictic regex. These are cheap and catch real bugs.
- No mocking of Meta APIs beyond recorded fixtures: save one real response per model to `src/meta/__fixtures__/` (no secrets) and test the parsers against them.

---

## 11. Meta model integration

### 11.1 Models used

| Model | ID | Role in Name It | Price (Model API) | Rate limit |
|---|---|---|---|---|
| Muse Voice Transcribe | `muse-voice-transcribe-1.0` | Turns, timestamps, diarization, keyword biasing | $0.18 per audio hour | 256 concurrent streams |
| SAM 3.1 | `sam-3.1` | Open-vocabulary segmentation and tracking of the referent | $0.20 per 1,000 video frames (min 50 frames per video request); $2.50 per 1,000 images | 3,000 RPM |
| Muse Spark 1.3 | `muse-spark-1.3` | Classification, localisation, glossary, naming, on-screen text, cue writing | $1.25 in / $4.25 out per M tokens | 3,000 RPM, 4M TPM |
| Muse Spark 1.2 | `muse-spark-1.2` | Only if sending audio directly to an LLM (1.3 does not fully support audio input) | same | same |
| Muse Wonder 1.0 | `muse-wonder-1.0` | Optional: eval judge for borderline resolutions. Use sparingly | $4 in / $20 out per M tokens | 3,000 RPM |

Not used: Muse Image (no role), Muse Glimmer / Spark Open (self-hosting not worth it in 5 days), Contributor tiers (Meta trains on inputs; keep everything on Standard; it is cheap enough).

**Non-Meta service: ElevenLabs (text-to-speech only).** Meta offers no speech synthesis (Muse Voice Transcribe is speech-to-text only), so ElevenLabs fills two gaps: (a) narrating the demo footage (Section 14.3), and (b) the description voice in the player (F11b). It does no understanding or reasoning; all perception and language work stays on Meta models. Say this in one line in the README so the Meta-tooling story stays clear. Nathan already has ElevenLabs credits. Check the plan's terms for commercial use and attribution, and credit it in `CREDITS.md`. API shapes: `TODO-VERIFY` against the ElevenLabs docs; keep calls in `src/tts/elevenlabs.ts`.

### 11.2 Endpoints and docs
- Overview: https://dev.meta.ai/docs/overview
- Quickstart: https://dev.meta.ai/docs/quickstart
- Models: https://dev.meta.ai/docs/models
- Pricing and limits: https://dev.meta.ai/docs/pricing-rate-limits
- Cookbook: https://github.com/meta-models/meta-model-cookbook (start with `01_api_fundamentals`)
- Transcribe: `POST /v1/asr/transcribe` (batch) or `wss://api.meta.ai/v1/asr/realtime`. Name It uses batch, multipart, `mode: "DIARIZATION"` (verified 31 Oct).
- SAM 3.1: via the Responses API; Files API for clips used repeatedly. Output is a streamed text grammar (not JSON), parsed with `@meta-sam/parser` (verified 31 Oct).
- Spark: Chat Completions with `response_format` json_schema, images as data URLs in the user message (verified 31 Oct).
- **Verified shapes and deviations from this PRD are logged in `docs/DECISIONS.md` (31 Oct entry).**

### 11.3 Cost estimate per 5-minute video
- Transcribe: 5 min ≈ $0.015.
- SAM: about 12 references (2.46/min) × 50-frame minimum ≈ 600 frames ≈ $0.12.
- Spark: glossary (about 150K tokens in) ≈ $0.19; per-reference calls (about 12 × 3 calls × 15K tokens) ≈ $0.68; cue writing ≈ $0.05. Total ≈ $0.95.
- **About $1.20 per video.** With $150 in credits, budget allows over 100 full runs. Cost is not a constraint; do not optimise prematurely. Do set a spend-limit alert on the Billing page.

### 11.4 Environment
```
MODEL_API_KEY=...                          # Meta's own name for it (was META_API_KEY; changed 31 Oct)
MODEL_API_BASE_URL=https://api.meta.ai/v1  # verified 31 Oct
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_NARRATOR=...   # voice for demo-clip narration (the "presenter")
ELEVENLABS_VOICE_ID_DESCRIBER=...  # a clearly different voice for Name It's descriptions
```
Use two clearly different voices, so the viewer can always tell the presenter from Name It.

---

## 12. Prompts

All prompts live in `src/prompts/`. Every LLM call requests **structured JSON output** validated with zod. Prompts below are starting drafts; record changes in `docs/DECISIONS.md`.

### 12.1 Shared description rules (prepended to every writing prompt; distilled from the DCMP Description Key [S13], VideoA11y [S6] and ADx3 [S4])
```
You write audio description for blind and low-vision viewers of how-to videos.
Rules:
1. Describe only what the audio does not already convey. Never repeat what the presenter says.
2. Be specific: name the exact tool, ingredient, part or amount. "the 10mm socket", not "a tool".
3. Prefer the names the presenter uses elsewhere in the video (see GLOSSARY).
4. Present tense, active voice, third person.
5. Describe observable things only. No inferred emotions, no opinions, no guessing.
6. Label first, then define if needed.
7. For instructional content, the sequence of actions matters most.
8. Use clear spatial references: left/right from the viewer's perspective, near/far, clock positions, familiar objects.
9. Use "a" to introduce something new, "the" for something already named.
10. Be brief. Every word costs the viewer time.
11. If you are not sure what something is, say you are not sure. Never invent a specific name.
```

### 12.2 Reference classifier (F3 stage B)
```
SYSTEM: {shared rules}
TASK: Decide whether the highlighted word in the sentence refers to something visible in the video (exophoric) or to earlier speech or an abstract idea (anaphoric/non-visual).
INPUT: previous turn, current turn with the phrase marked as [[this]], next turn, 4 frames spanning the turn.
OUTPUT JSON: { "isVisualReference": boolean, "referenceKind": "object"|"state"|"location"|"amount"|"action"|null, "reason": string }
Examples:
- "Now add [[this]] to the bowl" with a hand holding a cup of sugar → visual, object
- "[[This]] recipe was my grandmother's" → not visual
- "Whisk until it looks like [[this]]" → visual, state
- "Put it right [[here]]" → visual, location
```

### 12.3 Localisation (F4 step 2)
```
TASK: The presenter says: "{sentence}". The word "{phrase}" refers to something visible.
These frames are in time order at 0.5 s intervals. Which frame best shows the thing "{phrase}" refers to being held, pointed at, placed or changed?
OUTPUT JSON: { "bestFrameIndex": number, "nounPhraseGuess": string, "reason": string }
```

### 12.4 Glossary (F6 context pack)
```
TASK: From this full transcript and these keyframes, list every tool, ingredient, part, material and amount that appears in the video.
OUTPUT JSON: { "entities": [ { "name": string, "aliases": string[], "firstSeenSec": number, "mentionedInSpeech": boolean } ] }
```

### 12.5 Resolution (F6)
```
SYSTEM: {shared rules}
CONTEXT: GLOSSARY {glossary}, TRANSCRIPT EXCERPT (±30 s) {excerpt}
TASK: The presenter says "{sentence}". Resolve "{phrase}" ({kind}).
The highlighted region in the image (mask overlay) was selected because: {selectionReasons}.
- object/amount: give the most specific accurate name, using glossary names where they match.
- state: describe the observable state (texture, colour, shape, level).
- location: describe where, relative to obvious landmarks.
If the highlighted region does not look like what the presenter is referring to, say so.
OUTPUT JSON: { "resolvedText": string|null, "specificity": "specific"|"generic", "usedGlossaryEntry": string|null, "confidence": number, "uncertaintyNote": string|null }
```

### 12.6 Cue writer (F9)
```
SYSTEM: {shared rules}
TASK: Write audio description for this moment.
Resolution: "{resolvedText}" for "{sentence}".
Short cue: at most {budgetWords} words. Long cue: at most 25 words.
The short cue must make sense on its own when spoken in the pause after the presenter's sentence.
OUTPUT JSON: { "short": string, "long": string }
Example: sentence "Now add this", resolution "the two cups of flour" → short "Two cups of flour.", long "She tips the two cups of flour into the large glass bowl."
```

### 12.7 On-screen text (F8)
```
TASK: List text visible in this frame that gives task information (amounts, temperatures, times, part numbers, step titles). Ignore logos, watermarks and channel names.
OUTPUT JSON: { "items": [ { "text": string, "kind": "amount"|"temperature"|"time"|"part"|"title"|"other" } ] }
```

---

## 13. Evaluation plan (Technical Depth: 20%)

### 13.1 Test set
- **5 to 8 how-to clips**, 2 to 5 minutes each, cooking plus at least one non-cooking (bike repair, crafts, assembly). Sourced per Section 14.3.
- Two kinds of clip, reported separately:
  - **Scripted clips** (stock footage plus ElevenLabs narration): used for development and tuning. Nathan wrote the references, so these numbers flatter the system. Label them "scripted" in every table.
  - **Real-narration clips** (Prelinger Archives instructional films): the **held-out set**, never used while tuning prompts or thresholds. Natural, unscripted narration by a real presenter. **These are the headline numbers.**
- Nathan hand-labels every visual reference: time, phrase, true referent, acceptable alternatives (`src/eval/labels/<videoId>.json`). Target **60 to 100 references** total, at least 20 from the real-narration clips.
- Also label on-screen text items (P1).
- Note: synthetic narration is clean studio audio, so transcription will look better on scripted clips than on real ones. Another reason the held-out real-narration numbers are the honest ones.

### 13.2 Metrics (`pnpm eval` writes `docs/EVAL.md` and `data/eval/latest.json`)

| Metric | Definition | Target |
|---|---|---|
| Detection recall | visual references found / labelled | ≥ 0.80 |
| Detection precision | true visual / predicted visual | ≥ 0.75 |
| Resolution accuracy | correct / non-abstained (judged against label plus alternatives; Wonder as judge for borderline cases, Nathan spot-checks 20%) | ≥ 0.70 |
| Abstention rate | abstained / detected | report; aim 10 to 25% |
| Hallucination rate | confident (`ready`) and wrong / `ready` | ≤ 0.10 |
| `ready` bucket precision | correct / `ready` | ≥ 0.85 |
| Unresolved visual references per minute | before Name It vs after (Liu et al. metric [S1]) | headline number for the demo |
| Cue timing fit | inline cues ending before the next speech turn | 100% |
| Draft acceptance | approved unchanged / reviewed (from `edits.json`) | report |
| On-screen text recall (P1) | found / labelled | ≥ 0.70 |

### 13.3 Baseline (shows the value of grounding)
Run a **no-grounding baseline**: Spark gets the frames plus sentence and names the referent directly, without SAM, glossary or self-consistency. Report both side by side. If grounding does not beat the baseline, that is a negative result: record it and tell Nathan immediately, because it changes the pitch.

### 13.4 Display
`/eval` page shows the metrics table, baseline vs Name It, and 3 example items (one success, one abstention, one failure) with evidence overlays. The demo shows this page for about 10 seconds.

---

## 14. Demo plan (Demo: 25%, and the Stage Three artifact)

### 14.1 Three-minute video script

| Time | Beat | Shows | Rubric |
|---|---|---|---|
| 0:00 to 0:20 | **Hook: close your eyes.** Black screen, audio of a how-to clip: "Now add this... and mix until it looks like this." Caption: "This is what a how-to video sounds like without sight." *(Do not use WHO's "2.2 billion with vision impairment" figure: it counts near-vision and correctable impairment, so it overstates the blind and low-vision audience. A judge who knows that will discount everything else.)* | Black screen, audio only | Impact |
| 0:20 to 0:40 | **The problem, with evidence.** Visual references average 2.5 per minute (Liu et al., CHI 2021). Only about 7% of videos requested on YouDescribe get described. AI describers are "generic about tools and steps." | Simple text cards, cited | Impact |
| 0:40 to 1:20 | **How it works, live.** Run the pipeline on a clip. Show transcript with "this" highlighted, then the SAM mask snapping onto the bowl in the presenter's hand, then the glossary match, then the cue "Two cups of flour." Callouts naming each Meta model as it acts. | Screen recording of the pipeline view | Meta tooling, Technical |
| 1:20 to 1:50 | **Honesty: evidence and abstention.** An abstained item: "Name It wasn't sure", with candidates. Reviewer fixes it with two keypresses. | Review UI | Technical, Impact |
| 1:50 to 2:25 | **The payoff: play it back.** Same opening clip, black screen again, now with Name It's descriptions spoken in the gaps and one extended pause. | Player, screen black or blurred | Demo |
| 2:25 to 2:45 | **Numbers.** Eval table: resolution accuracy, hallucination rate, unresolved references per minute before vs after, baseline comparison. | `/eval` page | Technical |
| 2:45 to 3:00 | **Close.** "Built in 5 days during the hackathon with Muse Spark, SAM 3.1 and Muse Voice Transcribe. Designed to plug into volunteer description workflows like YouDescribe." Repo and live link. | End card | Impact |

Rules for the video: under 3:00; captions on; clearly state "everything shown was built during the hackathon" and "demo narration is synthetic (ElevenLabs)"; record at 1080p, export H.264. The submission asks for a **video link** (the guide says to check "your video link is accessible"), so upload to YouTube as unlisted (or similar) **by Wednesday 16:00** and test the link in a private browser window.

### 14.2 Live product
Deployed Vercel link with at least 3 processed demo videos: review UI and player both working. Judges asked "does the product hold up live?" Make sure the player works on Chrome and Safari.

### 14.3 Demo footage (decided 30 Oct; rights-clean, no private property, no personal voice)
Constraints from Nathan: no filming of rooms, friends' rooms, school or private property, and Nathan's own voice does not appear.

**Source A, demo clips: stock footage plus ElevenLabs narration.**
- Pexels or Pixabay cooking or DIY clips, silent or music-only, with **tight close-ups of hands handling objects** (SAM needs this). Pick 2 to 4 clips that can be cut into one coherent 2 to 3 minute "recipe" or "repair".
- Write a narration script per clip (Section 14.4), generate it with ElevenLabs using the narrator voice, and mix it over the footage with ffmpeg (`scripts/build-demo-clip.ts`: download clip(s), concatenate, generate narration per line at given timestamps, mix, output mp4).
- The Pexels licence allows modifying and combining into a new work. Do not redistribute the raw files: commit the download script, the narration script and the build script, not the video. Credit every clip in `CREDITS.md`.
- Disclose in the README and the demo that the narration is synthetic.

**Source B, held-out test clips: Prelinger Archives (Internet Archive).**
- Thousands of mid-century educational and instructional films (cooking, sewing, home repair, crafts), with real presenters narrating while demonstrating. The Archive explicitly invites people to download, use and reproduce them in any medium. [S15]
- Download from archive.org (allowed, unlike YouTube). Credit each film in `CREDITS.md`.
- Expect black-and-white, lower-resolution footage. Check in the M0 spike that SAM copes.
- **Skip** Cold War, civil defence, propaganda and social-guidance films (anti-project list: political or war).

**Not used:** YouTube videos. Public does not mean licensed: almost all are under YouTube's standard licence (creator keeps copyright), and YouTube's terms forbid downloading except through YouTube's own features, even for CC-BY videos. *Optional extra:* email 2 or 3 small cooking or DIY creators for permission to use one video, credited. If one says yes, add it to the held-out set.

Avoid health, fitness, medical or sports content (anti-project list).

### 14.4 Writing narration scripts for the scripted clips
The narration has to sound like a real how-to presenter, not like audio description. Real presenters are vague because they assume you can see. Rules:

1. **Make a shot list first.** Watch the stock clips and note the timestamp of every action (picks up X, pours Y, shows result). Write each narration line against a timestamp.
2. **Visual references at a realistic rate:** about 3 to 5 per minute (Liu et al. found a median of 2.46, up to 13.8 [S1]).
3. **Cover every reference kind at least once per clip:** object ("add this"), amount ("about this much"), state ("until it looks like this"), location ("put it right here"), and a plural ("these").
4. **Include 1 or 2 non-visual decoys per clip** ("this recipe is so easy", "that's the secret") so the classifier has something to reject.
5. **Vary naming:** sometimes name the object elsewhere in the video ("grab the flour... now add this"), which tests the glossary; sometimes never name it, which tests visual naming.
6. **Leave pauses:** 1.5 to 3 s gaps after some reference sentences (room for inline cues), and at least two references followed immediately by more speech (forces extended description).
7. Keep the narrator casual: "okay", "so", "nice". Stiff narration sounds fake.

**Example script (template; adapt to the actual shot list):**
```
[00:00] Okay, so today we're making a quick pancake batter. This recipe is honestly so easy.
[00:06] First, grab the flour. You want about this much in the bowl.
[00:11] (pause 2 s)
[00:13] Then crack two of these in here.
[00:17] (pause 2 s)
[00:19] Now add this, and just a splash, not too much.
[00:24] Give it a good whisk until it looks like this.
[00:29] (pause 3 s)
[00:32] See that? That's the consistency you're after.
[00:36] Heat the pan, then pour some of that right here, in the middle.
[00:41] (pause 2 s)
[00:43] Wait for these little bubbles, then flip it.
[00:48] And that's it. That's the secret, honestly: don't rush it.
```
Labels for this template (also the eval labels): "about this much" = amount of flour; "two of these" = eggs; "in here" = the mixing bowl; "add this" = milk (never named: tests visual naming); "like this" = smooth, thick batter (state); "some of that" = batter; "right here" = centre of the pan (location); "these little bubbles" = bubbles on the pancake surface; "This recipe", "That's the consistency", "That's the secret" = non-visual decoys (the second refers back to the batter shown earlier, so judge it carefully).

---

## 15. Milestones and schedule

Today is Friday 30 Oct. Five build days. Each milestone ends with Nathan verifying locally.

| Day | Milestone | Done when | Cut line if behind |
|---|---|---|---|
| **Sat 31 Oct (AM)** | **M0 Spike (gate).** Claim API credits if not done. Post the Discord question (Section 17). Two clips by hand: one Prelinger instructional film (real narration, old footage) and one stock clip with a quick ElevenLabs narration of the template script. For each: Transcribe, find the "this" moments, SAM on those windows, Spark naming. | At least half of 5 to 10 references come out right. **If not, stop and rethink with Claude before building more.** | None. This is the go/no-go gate. |
| Sat 31 Oct (PM) | **M1 Skeleton + ingest + transcribe.** Repo, env, Meta adapters, stages 01 and 02, unit tests for gaps. | `pnpm pipeline demo1 --to 02` produces transcript and gaps | |
| Sun 1 Nov | **M2 Detect + localise + ground.** Stages 03 to 06, mask selection heuristic with unit tests. Start labelling the test set in parallel. | Evidence PNGs look right on 2 clips | Skip motion rule in mask selection |
| Mon 2 Nov | **M3 Resolve + confidence + cues.** Stages 07 and 09, placement algorithm with tests, WebVTT output. Run first eval. | `pnpm eval` prints a table | Self-consistency becomes a single call |
| Tue 3 Nov | **M4 UI.** Review UI and accessible player; deploy to Vercel. P1 on-screen text only if ahead. Ask any submission questions in Discord today (last full day). | Keyboard-only review and eyes-closed playback both work | Review UI without scrub |
| Wed 4 Nov | **M5 Demo + submit.** Final eval on held-out clips, README, CREDITS, DECISIONS, record and edit demo video, test-upload by 16:00, **submit by 20:00 London**. | Submission confirmed on the CV platform | No new features after 12:00 |

---

## 16. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SAM cannot segment small held objects (spoon of salt) or hands occlude them | Medium | High | Hand-object heuristic; fall back to Spark-only naming with lower confidence; abstain; report in eval. Choose demo clips with clear close-ups. |
| No word-level timestamps; wrong moment chosen | Medium | Medium | Proportional estimate plus visual refinement (F4); wider window; P2 forced aligner. |
| Spark names generically ("white powder") | Medium | High | Glossary from the whole video; prompt rule 2/3; self-consistency; measure `specificity`. |
| Grounding does not beat the no-grounding baseline | Low to medium | High (pitch) | Run the baseline on Monday, early enough to adjust the pitch toward evidence and abstention if needed. Record the negative result. |
| API shape surprises or outages | Medium | High | Adapters isolated in `src/meta/`; fixtures; cache every response to disk so re-runs don't re-call. |
| Judges see it as "just audio description" | Medium | High | Lead with "this", not with "AI describes video". Show the CrossA11y gap and the evidence overlay. |
| Vid2Coach comparison | Low | Medium | One sentence in README and demo: they coach the task live; we make the video accessible. |
| No BLV user testing | Certain | Medium | State it plainly; follow published guidelines; frame as volunteer draft tool; eval on objective metrics. |
| Demo submission fails at the deadline (Lecture Lens was late because of the video file) | Medium | Critical | Submission takes a video *link*: upload as unlisted by Wednesday 16:00 and test the link logged out. |
| Scripted clips flatter the eval | Certain | Medium | Report scripted and real-narration (Prelinger) results separately; headline the real ones. |
| Old Prelinger footage (black and white, low resolution) breaks SAM | Medium | Medium | Check in the M0 spike; choose films with close-ups; if it fails, record it as a negative result and use more scripted clips plus any creator-permitted video. |
| Scope creep | High | High | Section 6 non-goals; Claude Code flags anything outside P0/P1. |

---

## 17. Open decisions for Nathan

1. **Problem statement:** recommended **Build for Your World**, via its "make something possible that wasn't before" line. Push the Frontier is worded around software, robotics, manufacturing, science and physical systems, so Name It would be a stretch there. Do not claim firsthand experience of blindness; anchor the pitch in the research and the volunteer supply gap. *Nathan to confirm.*
2. ~~Product name~~ Decided 30 Oct: **Name It** (written with a space). Rejected: Narrator (clashes with the Windows screen reader), Orator (wrong meaning), Pinpoint (did not land).
3. ~~Demo footage~~ Decided 30 Oct: stock footage plus ElevenLabs narration for demo clips; Prelinger Archives films for the held-out real-narration test set (Section 14.3). No YouTube, no own voice, no filmed rooms.
4. **Ask in Discord #questions** (draft):
   > Hi! For our demo we'd like to use stock footage (Pexels licence, which permits modification) with AI-generated voiceover narration, plus public-domain instructional films from the Prelinger Archives, all credited in the repo. Is that acceptable for the demo video and judging? Thanks!
5. **On-screen text (F8):** recommended to **stay P1, but first in line** after P0. Every audio description tool already reads text, so it doesn't sharpen what makes Name It different, and stock clips rarely have text overlays. Build it only if P0 and the eval are solid by Monday night. *Nathan to confirm.*

---

## 18. README requirements (judges read it)

- One-paragraph pitch plus the positioning statement (Section 4).
- **"Built during the hackathon"** section listing every component, dated.
- Architecture diagram (pipeline stages and which Meta model does what).
- How to run locally (`pnpm i`, `.env.local`, `pnpm pipeline <id>`, `pnpm dev`).
- Eval results table, with the baseline comparison and a link to `docs/EVAL.md`.
- Limitations, stated honestly: no BLV user testing yet; how-to videos only; English only; small test set.
- Research foundation, with the citations in Section 19.
- `CREDITS.md` link: every stock clip and Prelinger film (source, creator, licence), plus ElevenLabs for synthetic voices.
- A clear note that the demo clips' narration is synthetic (ElevenLabs), and that the description voice is ElevenLabs because Meta offers no speech synthesis; all understanding runs on Meta models.

---

## 19. Sources

- **[S1]** Liu, X. et al. *What Makes Videos Accessible to Blind and Visually Impaired People?* CHI 2021. https://amypavel.com/papers/videosearch.pdf
- **[S2]** *"It's Kind of Context Dependent": Understanding Blind and Low Vision People's Video Accessibility Preferences Across Viewing Scenarios* (2024). https://ar5iv.labs.arxiv.org/html/2403.10792
- **[S3]** Liu, X. et al. *CrossA11y: Identifying Video Accessibility Issues via Cross-modal Grounding.* UIST 2022. https://ar5iv.labs.arxiv.org/html/2208.11144
- **[S4]** *ADx3: A Collaborative Workflow for High-Quality Accessible Audio Description* (2026). https://arxiv.org/html/2602.02684
- **[S5]** *Describe Now: User-Driven Audio Description for Blind and Low Vision Individuals.* DIS 2025. https://arxiv.org/pdf/2411.11835
- **[S6]** *VideoA11y: Method and Dataset for Accessible Video Description* (2025). https://arxiv.org/html/2502.20480v1
- **[S7]** *SPICA: Interactive Video Content Exploration through Augmented Audio Descriptions for Blind or Low-Vision Viewers.* CHI 2024. https://ar5iv.labs.arxiv.org/html/2402.07300
- **[S8]** Huh, M. et al. *Vid2Coach: Transforming How-To Videos into Task Assistants.* UIST 2025. https://arxiv.org/html/2506.00717v2
- **[S9]** Northeastern University News, *Researchers use AI to improve video accessibility for blind users* (June 2025). https://news.northeastern.edu/2025/06/27/video-accessibility-blind-users-ai
- **[S10]** ViddyScribe (Double Tap interview). https://doubletaponair.com/how-viddyscribe-is-bringing-real-time-audio-description-to-youtube/
- **[S11]** YouTube Help, *Add audio descriptions.* https://support.google.com/youtube/answer/16166822
- **[S12]** *CoSight: Exploring Viewer Contributions to Online Video Accessibility Through Descriptive Commenting.* UIST 2025. https://arxiv.org/html/2508.08582v1
- **[S13]** DCMP, *Description Key: Guidelines and Best Practices for Describing Educational Video.* https://dcmp.org/descriptionkey/print
- **[S14]** YouDescribe app (Smith-Kettlewell Eye Research Institute). https://apps.apple.com/us/app/youdescribe/id1177344886
- **Meta Model API:** models https://dev.meta.ai/docs/models, pricing https://dev.meta.ai/docs/pricing-rate-limits, cookbook https://github.com/meta-models/meta-model-cookbook
- **Hackathon Participant Guide** (Cerebral Valley): rules, rubric, schedule, anti-projects list (provided by Nathan).
- **Pexels licence:** https://pexels.com/terms-of-service
- **[S15]** Open Culture, *Download 6,600 free films from the Prelinger Archives and use them however you like.* https://www.openculture.com/2016/05/download-6600-free-films-from-the-prelinger-archives-and-use-them-however-you-like.html ; Prelinger Archives: https://www.wikipedia.org/wiki/Prelinger_Archive