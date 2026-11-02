# Demo video script (under 3:00)

Follows PRD §14.1. Seven beats, about 2:55 in total. Every beat lists what is on screen, what is heard, and the caption.

**Rules for this video**
- Under 3:00, 1080p, H.264, captions on throughout.
- The voice-over (VO) is Nathan's own voice (decided 2 Nov, reversing PRD 14.3's "no personal voice": more authentic). Takes go in `data/demo/vo/beat{2,3,4,6,7}.m4a` (gitignored).
- Say on screen, at the end: "Everything shown was built during the hackathon" and "The clip presenter and the description voice are synthetic (ElevenLabs)".
- Upload to YouTube as **unlisted by Wed 4 Nov 16:00 London**, then open the link in a private window to check it plays logged out. Submit by 20:00.

**Before recording**
- Use a fresh Chrome guest window at 1920×1080, with the bookmarks bar hidden and zoom at 100%.
- Record system audio with OBS (QuickTime can't capture it). The player's descriptions must be in the recording.
- Use the live site (https://name-it-rho.vercel.app) so the URL is real. For beat 4, start from a clean browser, because review decisions are saved in it.

---

## 1. Hook: "close your eyes" (0:00 to 0:20)

**Picture:** black screen.
**Sound:** clip1's own audio from **0:03 to 0:21** with descriptions off (the presenter only):
> "Everything goes in here … Take a spoon of this … this part is really easy … about this much each time … and it goes in there … Then one more, just like that."

**Captions:** the presenter's words as they're spoken. At 0:16, a card over black:
> **Goes in where? A spoon of what? How much?**
> This is a how-to video without the picture.

No VO.

## 2. The problem (0:20 to 0:40)

**Picture:** three text cards, about 6 s each, on the app's cream background in its heading font.
1. **2.5** visual references per minute in online videos. *Liu et al., CHI 2021*
2. **~7%** of videos people ask YouDescribe to describe ever get described.
3. AI describers stay **vague about the exact tool or step**, and **guess** when unsure.

**VO** (about 45 words, 18 s):
> How-to presenters point at things all the time, about two and a half times a minute. If you can't see the screen, every "this" is a gap. Human describers can fill it, but there aren't enough: only about seven percent of requested videos ever get described.

Don't use the WHO "2.2 billion" figure (PRD 14.1 explains why).

## 3. How it works, live (0:40 to 1:20)

**Picture**, in four cuts of about 10 s each:
1. A terminal showing `pnpm run-pipeline clip1 --force`. The stages print in order, and they're cached, so it runs fast. Callouts appear as each model's stage prints: **Muse Voice Transcribe** (02), **Muse Spark** (03 to 05, 07, 09), **SAM 3.1** (06).
2. `/review/clip1`, item 2 ("Take a spoon of **this**"): the highlighted word, then the green mask on the bag of flour. Point the cursor at the mask.
3. The same item's details: "Name in video: **flour**" (the glossary match) and the reasons list ("touches a hand…").
4. The description box: **"Flour in white bag."** with "Inline, in the pause at 7.2 s".

**VO** (about 85 words, 34 s):
> Name It works on exactly that word. Muse Voice Transcribe gives it every sentence and every pause. Muse Spark finds each "this" that points at something on screen, and picks the frame that shows it. SAM 3.1 tracks every candidate object, and Name It chooses the one the hand is holding. Then Muse Spark names it the way the presenter does, "the flour", not "white powder", and writes a description short enough to fit the pause.

**Captions:** the VO, plus the model callouts.

## 4. Honesty: evidence and flagging (1:20 to 1:50)

**Picture:**
1. `/review/held-watch`, item 1 ("**Here** in a greatly simplified form…"). The green mask covers empty grass. The amber "Check" status and the caveat are visible: "Green box covers only empty grass…".
2. Press **E**, type `A water clock: a bucket on the grass, fed by a red garden hose.`, then press **Enter**. The list moves to the next item and the first one shows "Edited".
3. Press **A** on item 2 to show the speed: approve, and on to the next one.

**VO** (about 55 words, 22 s):
> When it isn't sure, it says so. Here SAM outlined the grass, not the water clock. Name It noticed, lowered its confidence, and sent it to a person instead of speaking it. A volunteer describer fixes it in a few keystrokes, and approves the good ones with one.

**Captions:** the VO. Small on-screen keys: **E** edit · **Enter** save · **A** approve.

## 5. The payoff: play it back (1:50 to 2:28)

**Picture:** black screen (or the video at 20% brightness with the description text big and readable), with "Name It on" in the corner.
**Sound:** record `/watch/clip1` with descriptions on and the voice on (default speed 1.1×), in two segments:
1. **0:03 to 0:21**, the same audio as the hook, now with Alice speaking in the pauses: "White mixing bowl." · "Flour in white bag." · "Spoonful." · "White spouted bowl on counter." · "Tipping flour in."
2. Cut to **0:33 to 0:42**. At 0:35.7 the video **pauses** for the long description ("A hand scoops lumpy banana-walnut batter…"), then carries on: "Glass container of brown walnuts."

**Captions:** each description in a different colour from the presenter's words. At the pause, add a caption: **(video paused for the description)**.

No VO. Let it play.

## 6. Numbers (2:28 to 2:45)

**Picture:** the `/eval` page, scrolled to the **held-out films** table. Zoom or highlight the three rows that matter.

**VO** (about 45 words, 17 s):
> On two real instructional films it was never tuned on, Name It named the right thing seventy-five percent of the time, against sixty without grounding, and was confidently wrong about half as often. It isn't perfect, so a person stays in the loop.

**Captions:** the VO, and the table stays readable.

## 7. Close (2:45 to 2:58)

**Picture:** end card in the app style:
> **Name It**
> Built in five days with Muse Spark, SAM 3.1 and Muse Voice Transcribe.
> name-it-rho.vercel.app · github.com/nathanlegit/NameIt
> Everything shown was built during the hackathon. The clip presenter and the description voice are synthetic (ElevenLabs).

**VO** (about 30 words, 12 s):
> Name It. Built during the hackathon with Muse Spark, SAM 3.1 and Muse Voice Transcribe, to plug into volunteer description workflows like YouDescribe.

---

## Checklist

- [ ] VO rendered (beats 2, 3, 4, 6, 7)
- [ ] Hook and payoff audio recorded from `/watch/clip1` (descriptions off, then on)
- [ ] Terminal, review and eval screen recordings
- [ ] Edited under 3:00, captions burned in or uploaded as subtitles
- [ ] Exported 1080p H.264
- [ ] Uploaded unlisted by Wed 16:00; link checked in a private window
- [ ] Submitted by Wed 20:00 London
