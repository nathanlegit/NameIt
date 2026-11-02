# Name It evaluation

Generated 2026-11-02T22:49:41.802Z by `pnpm eval`. Method: PRD Section 13. Raw data: `data/eval/latest.json`.

- **Scripted** clips use stock footage with our own narration and were used for tuning, so they flatter the system. **Held-out** clips have real narration and were never used for tuning: those are the honest numbers.
- **Baseline:** Spark sees the same frames and the sentence, and names the referent in one call: no SAM, no glossary, no transcript, no second answer. It uses Name It's detector, so detection numbers are shared.
- **Judge:** Spark compares each answer with the human label (text only). Verdicts can be overridden in `src/eval/overrides.json` after a human check.

## Held-out clips (real narration)

2 clips, 8.5 minutes, 37 visual references, 15 decoys.

| Metric | Target | Name It | Baseline |
|---|---|---|---|
| Detection recall | ≥ 80% | 86% (32/37) | same detector |
| Detection precision | ≥ 75% | 100% (0 false alarms on 15 decoys) | same detector |
| Resolution accuracy | ≥ 70% | 75% (24/32) | 60% (18/30) |
| Abstention rate | 10 to 25% | 0% | 6% |
| Hallucination rate (ready and wrong) | ≤ 10% | 22% | 41% |
| `ready` precision | ≥ 85% | 78% (of 18) | 59% (of 27) |
| Unresolved visual references per minute | lower | 4.3 → 1.5 | 4.3 → 2.2 |
| Cue timing fit (inline cues) | 100% | 100% (2 inline of 36 cues, 0 overlaps) | n/a |

## Scripted clips (tuning set)

5 clips, 3.8 minutes, 46 visual references, 15 decoys.

| Metric | Target | Name It | Baseline |
|---|---|---|---|
| Detection recall | ≥ 80% | 100% (46/46) | same detector |
| Detection precision | ≥ 75% | 94% (3 false alarms on 15 decoys) | same detector |
| Resolution accuracy | ≥ 70% | 83% (38/46) | 83% (38/46) |
| Abstention rate | 10 to 25% | 0% | 0% |
| Hallucination rate (ready and wrong) | ≤ 10% | 16% | 16% |
| `ready` precision | ≥ 85% | 84% (of 38) | 84% (of 44) |
| Unresolved visual references per minute | lower | 12.0 → 2.1 | 12.0 → 2.1 |
| Cue timing fit (inline cues) | 100% | 100% (42 inline of 58 cues, 0 overlaps) | n/a |

## All clips

7 clips, 12.4 minutes, 83 visual references, 30 decoys.

| Metric | Target | Name It | Baseline |
|---|---|---|---|
| Detection recall | ≥ 80% | 94% (78/83) | same detector |
| Detection precision | ≥ 75% | 96% (3 false alarms on 30 decoys) | same detector |
| Resolution accuracy | ≥ 70% | 79% (62/78) | 74% (56/76) |
| Abstention rate | 10 to 25% | 0% | 3% |
| Hallucination rate (ready and wrong) | ≤ 10% | 18% | 25% |
| `ready` precision | ≥ 85% | 82% (of 56) | 75% (of 71) |
| Unresolved visual references per minute | lower | 6.7 → 1.7 | 6.7 → 2.2 |
| Cue timing fit (inline cues) | 100% | 100% (44 inline of 94 cues, 0 overlaps) | n/a |

## Every labelled reference

| Clip | Time | Phrase | Label | Name It | Baseline |
|---|---|---|---|---|---|
| clip1 | 3.0 s | "here" | the cream mixing bowl on the counter | ✅ a white mixing bowl with spout sits on the counter behind the short glass *(ready, 0.99)* | ✅ An empty white bowl with a spout sits on the counter behind the water glass. *(ready, 0.90)* |
| clip1 | 6.0 s | "this" | the flour in the white paper bag | ✅ the flour in the white paper bag the presenter holds in both hands on the left *(ready, 1.00)* | ✅ a white powder in a tall white bag at left, falling into a white bowl on the counter *(ready, 0.90)* |
| clip1 | 9.4 s | "This" | *(decoy: not visual)* | ✅ rejected |  |
| clip1 | 11.8 s | "this much" | a heaped spoonful of flour | ✅ a spoonful of the flour, white and heaped, on the spoon a hand holds to the right of a white paper bag *(ready, 0.95)* | ✅ A small metal spoon holding a spoonful of white powder rises from the white paper bag. *(ready, 0.90)* |
| clip1 | 14.3 s | "there" | into the cream mixing bowl | ✅ the white mixing bowl with spout on the counter *(ready, 0.97)* | ✅ He empties a spoon of white substance into a white bowl on the counter behind a glass. *(ready, 0.95)* |
| clip1 | 18.0 s | "like that" | another spoonful of flour | ✅ A hand tips the spoon holding the white flour into the white mixing bowl with spout *(ready, 0.97)* | ❌ The presenter tips a spoonful of white powder from the bag into the bowl on the counter. *(ready, 0.90)* |
| clip1 | 21.3 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| clip1 | 30.6 s | "these" | the pink silicone spatula | ✅ a pink spatula in a hand in the stainless steel mixing bowl *(ready, 1.00)* | ✅ A small pink spatula, coated with batter, in the mixing bowl left of the walnut jar. She stirs. *(ready, 0.90)* |
| clip1 | 34.4 s | "like this" | folding the batter over with the spatula, turning the bowl | ✅ a hand scoops the lumpy banana-walnut batter from the bottom of the stainless steel mixing bowl next to that jar with the pink spatula and turns it over *(ready, 0.94)* | ✅ She scoops lumpy batter from the bottom of the metal bowl beside the jar of walnuts and turns the batter over with a pink spatula *(ready, 0.85)* |
| clip1 | 38.4 s | "that" | the glass jar of walnuts | ✅ that jar, a glass jar of brown walnuts, sits on the counter to the right of the stainless steel mixing bowl *(ready, 0.99)* | ✅ a glass jar of walnuts, open, sits to the right of the mixing bowl on the wooden counter *(ready, 0.95)* |
| clip1 | 38.4 s | "right there" | on the counter, to the right of the mixing bowl | ✅ on the wooden counter to the right of the stainless steel mixing bowl *(needs_review, 0.70)* | ✅ The open glass walnut jar stands on the counter to the right of the mixing bowl. *(ready, 0.95)* |
| clip1 | 44.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| clip1 | 48.0 s | "like this" | thick, lumpy pale batter with streaks of banana, held up on the spatula | ✅ The banana-walnut batter, thick and lumpy with visible walnut pieces, clings to the pink spatula. A hand holds the spatula upright in the stainless steel mixing bowl. *(ready, 0.91)* | ✅ The batter clings to the pink spatula she lifts from the metal bowl left of the walnut jar, thick and lumpy. *(ready, 0.85)* |
| clip1 | 61.8 s | "like that" | batter dropping off the spatula in thick clumps | ❌ A hand lifts the pink spatula with thick lumpy banana-walnut batter above the stainless steel mixing bowl *(ready, 0.96)* | ✅ the thick batter slides from the raised pink spatula into the metal bowl *(ready, 0.85)* |
| clip2 | 0.0 s | "right here" | the hole in the black membrane under the fingertip | ✅ A hand touches the dark soil in the left hole in the weed membrane *(ready, 0.91)* | ✅ The dark soil in the lower-left hole in the black fabric under her extended index finger. *(ready, 0.95)* |
| clip2 | 2.9 s | "this" | the pepper seedling | ✅ A hand holds a small green pepper seedling over a hole in the weed membrane. *(ready, 0.98)* | ✅ a small green seedling with soil on its roots pinched between fingers over the left hole in the black fabric lowers into the hole *(ready, 0.95)* |
| clip2 | 4.6 s | "like this" | pressing the soil around the seedling with the fingertips | ✅ A hand presses the soil around the base of the pepper seedling in the weed membrane hole. *(ready, 0.98)* | ✅ A hand presses the soil around the base of the seedling with the fingertips. *(ready, 0.90)* |
| clip2 | 12.0 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| clip2 | 14.0 s | "there" | the next hole in the membrane | ✅ the hole in the weed membrane in the center *(ready, 0.87)* | ✅ the empty hole contains dark soil to the right of the seedling on the left *(ready, 0.95)* |
| clip2 | 17.0 s | "this one" | the second pepper seedling | ✅ a pepper seedling with green leaves and exposed roots, a hand lowers it into the middle hole in the weed membrane *(ready, 0.97)* | ✅ a small green seedling with exposed roots over the middle hole to the right of the planted seedling on the left moves down *(ready, 0.92)* |
| clip2 | 18.8 s | "like that" | pressing the soil on both sides of the seedling with two fingers | ❌ A hand with soil on the fingertips spreads flat onto the weed membrane to the left of the pepper seedling *(ready, 0.89)* | ✅ A hand tamps dark soil around a small green seedling in a black fabric hole, fingertips to the left and right of the stem. *(ready, 0.90)* |
| clip2 | 23.2 s | "like this" | the seedling standing upright in firmed soil in its hole | ✅ the pepper seedling with green leaves sits in the center hole in the weed membrane *(ready, 0.89)* | ✅ the small green seedling shows a straight stem in the center hole in the black fabric *(ready, 0.90)* |
| clip2 | 25.6 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| clip2 | 25.6 s | "there" | *(decoy: not visual)* | ✅ rejected |  |
| clip3 | 0.2 s | "this" | the small terracotta pot | ✅ a terracotta pot, empty, a hand holds at center of brown paper sheet *(ready, 0.97)* | ✅ An empty small terracotta pot at top center, left of the potted plant. He holds it with one hand and lifts a hand trowel from inside it. *(ready, 0.96)* |
| clip3 | 2.8 s | "here" | the white tray of dark soil | ✅ the white rectangular soil tub with dark soil on the lower right of the brown paper sheet *(ready, 0.98)* | ✅ A filled white rectangular container at the bottom right of the table, he digs in it with a small trowel. *(ready, 0.95)* |
| clip3 | 5.6 s | "This" | *(decoy: not visual)* | ✅ rejected |  |
| clip3 | 8.4 s | "this much" | one trowelful of soil | ✅ A hand holds a small hand trowel heaped with the dark soil over a terracotta pot. *(ready, 0.95)* | ✅ He lifts a trowel heaped with dark soil from a white tub at bottom right *(ready, 0.90)* |
| clip3 | 10.4 s | "there" | into the terracotta pot | ✅ the empty terracotta pot at the top center *(ready, 0.98)* | ✅ a small empty terracotta pot he holds at top center next to the potted herb *(ready, 0.95)* |
| clip3 | 14.2 s | "this" | the small hand trowel with a wooden handle | ✅ a small hand trowel with dark soil on the blade in the white rectangular soil tub, a hand gripping the wooden handle *(ready, 0.94)* | ✅ A small hand trowel with a light wooden handle scoops dark soil from the white bin at bottom right. *(ready, 0.82)* |
| clip3 | 17.0 s | "That" | *(decoy: not visual)* | ❌ flagged as visual |  |
| clip3 | 20.0 s | "right there" | into the terracotta pot | ✅ into a terracotta pot containing dark soil *(ready, 0.92)* | ✅ He tips soil from the hand trowel into the terracotta pot left of the leafy plant. *(ready, 0.90)* |
| clip3 | 22.4 s | "like this" | the terracotta pot filled with dark soil nearly to the rim | ✅ the soil sits dark and level just below the rim in a terracotta pot at center *(needs_review, 0.70)* | ✅ A terracotta pot at top center holds dark soil leveled just below the rim as he lifts a hand trowel out. *(ready, 0.90)* |
| clip3 | 29.4 s | "this one" | the ficus plant in the white pot | ✅ a small leafy tree plant with green leaves and exposed roots stands over the white pot in the right foreground while a hand grips its stem *(ready, 0.94)* | ✅ A small plant with broad green leaves in the white pot in the lower right, hands pull its stem upward *(ready, 0.85)* |
| clip3 | 31.9 s | "like this" | pulling the plant up by its stem so the root ball comes out of the white pot | ✅ A hand pulls a small leafy tree plant with dark soil and roots upward out of a white pot. *(ready, 0.95)* | ✅ She grips the stem and lifts the soil-covered root ball upward from the white pot. *(ready, 0.90)* |
| clip3 | 33.9 s | "these" | the root ball of soil and roots under the plant | ✅ these roots form a dark soil-covered ball under a small leafy tree plant a hand holds above a grey pot *(ready, 0.94)* | ✅ the soil-covered base of the stem she holds in the right foreground over the empty gray pot *(ready, 0.92)* |
| clip3 | 35.9 s | "this" | the larger grey pot | ✅ a grey pot holds dark soil around the base of the small leafy tree plant on the floor in front of the presenter *(ready, 0.90)* | ✅ An empty gray pot on the floor below the root ball. She lowers the plant toward it. *(ready, 0.96)* |
| clip3 | 40.2 s | "right here" | the plant's stem, just above the soil in the grey pot | ❌ the grey pot sits on the floor with the small leafy tree plant upright inside *(ready, 0.88)* | ✅ The lower hand joins the upper hand on the upright stem in the center of the gray pot. *(ready, 0.90)* |
| clip3 | 44.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| clip4 | 0.3 s | "this" | the green drill bit case | ✅ a green tool case lies open on a wooden surface under the presenter's hands *(ready, 0.99)* | ✅ the open green case on the table, both hands resting on it *(ready, 0.95)* |
| clip4 | 4.0 s | "right here" | the row of small bits in the case where the fingers are | ✅ A hand touches the middle row of small silver bits in a green tool case. *(needs_review, 0.70)* | ✅ A row of small silver drill bits in the center of the green case. The index finger of the hand at frame left touches their tips. *(ready, 0.88)* |
| clip4 | 8.6 s | "these" | the strip of screwdriver bits pulled from the case | ✅ A hand lifts a row of silver bits from the center of the green tool case. *(ready, 0.84)* | ❌ the small silver drill bits lined up in the center compartment. She pinches their top ends *(ready, 0.88)* |
| clip4 | 12.0 s | "This" | *(decoy: not visual)* | ❌ flagged as visual |  |
| clip4 | 16.5 s | "this one" | a single screwdriver bit taken off the strip | ✅ the bit sits in the white bit holder between the presenter's hands above the green tool case *(needs_review, 0.70)* | ❌ She lifts a white holder of small silver drill bits from the center of the green case *(ready, 0.90)* |
| clip4 | 23.9 s | "this" | the chuck of the green cordless drill | ✅ a drill chuck *(needs_review, 0.70)* | ✅ a black chuck at the front of a green drill she holds in both hands, a bit sticks out from its tip *(ready, 0.90)* |
| clip4 | 26.0 s | "like this" | twisting the drill's chuck by hand to lock the bit in | ✅ a hand rotates a drill chuck at the front of a power drill *(ready, 0.95)* | ✅ The black chuck around the bit at the front of the drill: she grips and rotates it, releasing and re-gripping *(ready, 0.85)* |
| clip4 | 31.5 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| clip4 | 36.0 s | "right here" | the screw standing in the pale wooden plank next to the gloved hand | ❌ the board beneath the bit *(ready, 0.85)* | ❌ the spot where the drill bit meets the wooden plank near its far edge *(ready, 0.92)* |
| clip4 | 39.4 s | "like this" | a gloved hand pressing the plank flat | ✅ a hand in a white work glove presses palm-down flat on the board *(ready, 0.96)* | ✅ presses a white-gloved hand flat on the board to the right of two upright screws with fingers spread *(ready, 0.90)* |
| clip4 | 43.4 s | "like that" | the drill driving the screw down into the plank | ✅ a power drill sinks the screw into the board *(ready, 0.97)* | ✅ A gloved hand holds a teal drill vertical with its bit on a partly inserted screw in a light plank to the right of a second standing screw, another gloved hand braces the near edge as the drill moves straight down *(ready, 0.90)* |
| clip4 | 51.0 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| clip4 | 51.0 s | "there" | *(decoy: not visual)* | ✅ rejected |  |
| clip5 | 0.3 s | "these" | the sheet of green patterned origami paper | ✅ a stack of patterned square papers on the upper right of the white table *(needs_review, 0.70)* | ✅ a flat square sheet of patterned paper rests in a pile at upper right of the table *(ready, 0.85)* |
| clip5 | 2.8 s | "like this" | folding the square diagonally into a triangle and pressing it flat | ❌ The presenter smooths the triangular patterned square paper flat in the center of the white table. *(ready, 0.95)* | ❌ She smooths the patterned paper triangle flat at the center with both hands. *(ready, 0.85)* |
| clip5 | 7.6 s | "This" | *(decoy: not visual)* | ❌ flagged as visual |  |
| clip5 | 11.6 s | "like this" | the paper opened out flat as a square again, with a diagonal crease | ✅ a patterned square paper, white side up with a diagonal crease. A hand on each side holds it flat at center of the white table *(ready, 0.91)* | ✅ Both hands hold the square paper flat, white-side-up, at center of the table *(needs_review, 0.62)* |
| clip5 | 15.6 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| clip5 | 19.8 s | "right there" | along the folded edge of the paper triangle | ❌ the middle of the patterned square paper folded into a triangle on the white table *(ready, 0.99)* | ❌ the middle of the folded triangle in the table center *(ready, 0.85)* |
| clip5 | 24.4 s | "this" | the top point of the paper triangle | ❌ the right corner of the folded triangular patterned paper in the center of the white table touches the presenter's right hand *(needs_review, 0.70)* | ❌ The lower-right corner of the folded patterned triangular paper in the center. Her right fingers touch it. *(ready, 0.80)* |
| clip5 | 27.4 s | "like that" | pinching the tip of the paper between the fingertips to fold it down | ✅ the presenter presses together the lifted far corner of the folded patterned triangle at the center of the white table *(ready, 0.85)* | ✅ Both hands squeeze the top point of the triangle between thumbs and forefingers at the center *(ready, 0.82)* |
| clip5 | 30.6 s | "those" | the finished pink origami heart and star on the left of the table | ❌ the dotted origami figure and the patterned origami crane pinched into small folds resting on the right side of the white table below the stack of patterned square papers *(needs_review, 0.70)* | ❌ the partly folded patterned papers that lie on the right by the square sheets *(needs_review, 0.70)* |
| held-meat | 0.0 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| held-meat | 0.0 s | "this" | the blade chuck roast, shown cooked as a pot roast on a platter with carrots, onions and potatoes (close-up, about 12 to 22 s) | ❌ the cooked first cut of the blade chuck roast rests on the serving plate with small red tomatoes and green leafy garnish *(ready, 0.89)* | ✅ the dark roast on the right side of a parsley-garnished platter, a hand touches it from above *(ready, 0.85)* |
| held-meat | 0.0 s | "this" | ('this first cut of the blade chuck roast') the same pot roast on the platter with carrots and onions | ✅ the first cut of the blade chuck roast cooked as pot roast on the serving plate in the foreground *(ready, 0.89)* | ✅ The bone-in blade chuck roast rests on a parsley- and tomato-garnished oval platter in the foreground. *(needs_review, 0.70)* |
| held-meat | 0.0 s | "this" | ('Now this is a very popular cut') the pot roast on the platter, still in close-up | ❌ missed |  |
| held-meat | 0.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-meat | 0.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-meat | 0.0 s | "this" | ('but this is a very versatile cut', about 36 s) the pot roast on the platter on the table in front of the presenter (bottom of frame, beside the booklets and pepper mill) | ❌ missed |  |
| held-meat | 0.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-meat | 0.0 s | "this" | ('this roast is USDA choice', about 46 s) the raw blade chuck roast on the kitchen counter that she walks to and handles | ✅ the first cut of the blade chuck roast *(needs_review, 0.65)* | (abstained, 0.90) |
| held-meat | 0.0 s | "this" | the purple shield-shaped USDA CHOICE grade stamps on the white fat covering of the raw roast (close-up, about 51 to 60 s, a knife tip points at them) | ❌ the raw first cut of the blade chuck roast sits on the counter between the presenter's hands *(needs_review, 0.70)* | ❌ the uncut first cut of the blade chuck roast at center of the table; she rests her hands on it *(ready, 0.80)* |
| held-meat | 0.0 s | "like this" | uncertain: probably the raw blade chuck roast on the counter in front of her ('pot roast it like this'; the transcript reads 'pot roast and like this'). Medium shot, about 65 s; she gestures in the air and does not point at anything | ✅ the first cut of the blade chuck roast in the presenter's hands *(needs_review, 0.57)* | ✅ A first cut of the blade chuck roast sits on the counter in front of her. She lowers both hands to it. *(ready, 0.80)* |
| held-meat | 0.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-meat | 0.0 s | "this" | ('of using this versatile cut', about 92 s) the raw blade chuck roast on the counter in front of the presenter (small, at the bottom of a medium shot) | ❌ the first cut of the blade chuck roast the presenter holds *(needs_review, 0.61)* | (abstained, 0.80) |
| held-meat | 0.0 s | "these" | the two raw beef cuts lying side by side under the beef chart: the rib cut and the first cut of the blade chuck, cut faces towards the camera | ❌ the raw rib cuts below the beef cut diagram *(ready, 0.97)* | ✅ Two large raw beef roasts rest side by side on a table below a beef chart. *(ready, 0.95)* |
| held-meat | 0.0 s | "this" | ('this very tender rib eye section', about 110 s) the rib-eye muscle in the cut face of the meat, pointed at with a pen-like pointer | ❌ the first cut of the blade chuck roast, raw marbled meat in lower frame, a hand pushes the knife into it *(ready, 0.85)* | ❌ The first cut of the blade chuck roast, the large raw roast on the right side of the table. She taps it with a thin pointer. *(ready, 0.85)* |
| held-meat | 0.0 s | "this" | ('this first part of the chuck', about 116 s) the blade chuck cut next to the rib, where the rib eye continues; the pointer moves across to the left-hand cut. Which cut is rib and which is chuck is not certain from the frames | ✅ the first cut of the blade chuck roast, raw red meat with white fat, lies in the lower foreground while a hand holds its top edge *(ready, 0.93)* | ✅ The first cut of the blade chuck roast, a large raw beef cut on the left beside a second cut on the right. She presses a thin dark stick to its center. *(ready, 0.85)* |
| held-meat | 0.0 s | "this" | ('this particular roast', about 121 s) the first-cut blade chuck roast shown in close-up beside the rib cut | ✅ the first cut of the blade chuck roast, raw marbled meat filling the lower frame under a hand *(ready, 0.91)* | ✅ The first cut of the blade chuck roast, the raw beef section on the right, sits beside a second raw section on the left; a hand with pink nail polish rests on its white fat cap. *(ready, 0.85)* |
| held-meat | 0.0 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-meat | 0.0 s | "this" | ('it's very easy to cut this', about 128 s) the raw blade chuck roast on the cutting board that she starts cutting with a knife | ✅ the first cut of the blade chuck roast *(needs_review, 0.66)* | ✅ A first cut of the blade chuck roast sits in front of her. She places both hands on it. *(ready, 0.85)* |
| held-meat | 141.6 s | "this" | the rib-eye muscle at the end of the roast next to where the rib bone was removed; her hand rests on it and the knife follows its seam | ✅ the rib eye section, a thick marbled red-and-white block on the white cutting board; a hand presses its top *(ready, 0.94)* | ✅ A thick block of red-and-white marbled meat stands upright on a white board. A hand presses the top from above while a knife cuts down the left side. *(ready, 0.90)* |
| held-meat | 141.6 s | "this" | ('this is where you get your boneless broilable steaks') the same rib-eye section of the roast | ✅ the rib eye section, the red-and-white marbled meat on the cutting board; a hand presses the top while the knife cuts the left side *(ready, 0.92)* | ❌ A thick block of raw red-and-white meat on a white cutting board; a hand steadies the top while a knife cuts down the left side. *(ready, 0.90)* |
| held-meat | 141.6 s | "this" | ('take out this very tender part') the rib-eye piece being cut out of the roast along the natural seam | ✅ the rib eye section, a thick red-and-white block that a hand grips on the white cutting board *(ready, 0.95)* | ❌ A raw marbled meat block sits on a white board. A hand holds the right side while a thin tool, possibly a knife, touches the dark-red center top. *(ready, 0.85)* |
| held-meat | 156.9 s | "this" | the boneless rib-eye piece she has just removed, which she turns over on the board | ✅ the very tender rib eye section, a thick red meat with white fat on the cutting board, turning under the presenter's hands *(ready, 0.98)* | ✅ A large raw beef roast sits on a white cutting board. The presenter's hands roll the roast over. *(ready, 0.85)* |
| held-meat | 161.6 s | "like that" | the rib-eye piece turned over and standing on the board as a compact boneless block, before she cuts it in two | ✅ the very tender rib eye section sits fat-side up between the presenter's hands on the cutting board *(ready, 0.82)* | ❌ a piece of red-and-white meat stands on end with a vertical cut down the middle on a counter in front of a white cutting board, two hands release it *(ready, 0.80)* |
| held-meat | 168.8 s | "this" | ('this section of the roast') the remaining less tender chuck part of the roast after the rib eye was removed, shown in close-up with the knife | ✅ the less tender part of the roast *(needs_review, 0.70)* | ✅ a raw less tender beef roast section on the cutting board as her hand presses it *(needs_review, 0.65)* |
| held-meat | 168.8 s | "this" | ('this is the less tender part') the same remaining chuck section of the roast | ✅ the less tender part of the roast *(needs_review, 0.70)* | ❌ A raw meat piece rests on a counter in front of her. She touches it with a hand on the viewer's left. *(needs_review, 0.60)* |
| held-meat | 168.8 s | "this" | ('with this entire cut') a whole uncut first-cut blade chuck roast in close-up, USDA stamps on its side, with the knife tracing where to cut | ❌ the less tender part of the roast, a thick upright chunk of red meat with white fat, standing on the cutting board *(ready, 0.93)* | ❌ A raw blade chuck piece stands on end at the center of the counter in front of her. She lays both hands on it. *(ready, 0.78)* |
| held-meat | 168.8 s | "this" | ('then this less tender part') the less tender chuck portion of that whole roast, indicated with the knife | ✅ the less tender part of the roast, a thick raw beef block with white fat, on the cutting board, a hand rests on top *(ready, 0.94)* | ❌ The raw blade chuck roast on a white cutting board in close-up; a knife tip touches its top. *(ready, 0.90)* |
| held-meat | 168.8 s | "this" | ('this can be used for stewing beef') the same less tender chuck portion, still on screen | ✅ the first cut of the blade chuck roast, raw with thick white outside fat covering, on the cutting board; the presenter holds the top and right side *(ready, 0.80)* | ✅ a large raw blade chuck roast on a cutting board, her hand rests on top *(ready, 0.75)* |
| held-meat | 168.8 s | "this" | ('using this versatile cut', about 198 s) the blade chuck roast pieces on the counter in front of her; small in a wide shot, so this is a weak visual reference | ❌ missed |  |
| held-meat | 168.8 s | "this" | the 'How to Buy Beef Steaks' booklet, shown in close-up with its companion 'How to Buy Beef Roasts' and an AGRICULTURE TV caption | ✅ the how to buy beef steaks booklet stands upright to the left of the flowers *(ready, 0.88)* | ✅ A booklet stands upright left of center, in front of a second booklet and left of white and yellow daisies. *(ready, 0.90)* |
| held-meat | 168.8 s | "this" | ('this very versatile cut of the blade chuck roast', about 223 s) the cooked pot roast on the platter on the table in front of the presenter | ❌ missed |  |
| held-watch | 0.5 s | "Here" | the water-clock demonstration on the lawn: red garden hose running from the outdoor faucet through the grey dial unit to the nozzle | ✅ the water clock setup on the grass in front of the tree *(needs_review, 0.70)* | ✅ A gray cylinder sits on grass near a tree trunk with red hoses coiled on both sides *(ready, 0.90)* |
| held-watch | 21.3 s | "these" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 29.0 s | "like this" | the stop-motion disassembly of the pocket-watch movement: bridges, wheels and the balance lift off and fly out of frame one by one | ❌ A silver gear lifts from the right side of the watch and arcs to the upper right. *(needs_review, 0.70)* | ✅ A toothed gear drifts away from the central movement toward the upper right *(ready, 0.80)* |
| held-watch | 38.5 s | "this" | the mainspring barrel: the round flat drum touched and then lifted by the tweezers from the row of laid-out watch parts | ✅ the main spring and barrel assembly, a small round silver disc tweezers hold above the row of parts *(ready, 0.83)* | ✅ A round silver disc right of center in a horizontal row of parts as tweezers grasp it. *(ready, 0.90)* |
| held-watch | 38.5 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 52.1 s | "This" | the coiled mainspring visible inside the giant toothed mainspring barrel of the model | ❌ the shiny main spring in tweezers that a hand holds above the laid-out parts *(needs_review, 0.70)* | ❌ a small round metal cylinder that tweezers hold at top center above the laid-out parts and turn to show the top *(ready, 0.90)* |
| held-watch | 58.1 s | "Here" | the winding stem with its copper crown on the right, the winding gears and the click on the large toothed barrel of the model (a hand turns the crown) | ✅ the silver winding stem with meshed gears and a click extends horizontally across a black background *(needs_review, 0.70)* | ✅ a white gear assembly on a black background: a large gear on the left meshes with a smaller gear in the center, a small click touches the large gear below, a hand at the far right turns the stem *(ready, 0.90)* |
| held-watch | 75.5 s | "here" | the giant balance wheel and hairspring assembly (spoked rim with screws, spiral hairspring in the centre) | ✅ the balance wheel and hair spring assembly *(needs_review, 0.70)* | ✅ a circular wheel with a spiral coil inside at center below two large gears, fading in *(ready, 0.85)* |
| held-watch | 75.5 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 103.7 s | "these" | the parts of the balance assembly just named (balance wheel, hairspring, balance staff, roller and jewel pin); a hand points at the centre and pushes the jewel pin so the wheel swings | ❌ missed |  |
| held-watch | 128.1 s | "this" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 128.1 s | "this" | the pallet: the anchor-shaped lever with a long horizontal arm and fork, laid over the right side of the balance wheel and then moved back and forth by hand | ✅ the pallet *(needs_review, 0.70)* | ❌ A translucent piece appears at center, overlapping the large toothed ring on the left. *(ready, 0.90)* |
| held-watch | 128.1 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 151.3 s | "like this" | the red pallet jewel on the upper end of the pallet cross arm, with its angled face (a white arrow points at it) | ✅ The pallet jewel, a small red rectangle, sits in the upper slot of the pallet. A white arrow points to it. *(needs_review, 0.53)* | ❌ a rectangular slot in an upper metal piece at top center holds a red bar *(ready, 0.80)* |
| held-watch | 155.7 s | "Here" | the escape wheel with hooked teeth that fades in to the right of the pallet | ✅ the escape wheel, a silver spiked wheel, sits on the right beside the pallet *(ready, 1.00)* | ❌ A toothed ring fades in to the right of the lever. *(ready, 0.95)* |
| held-watch | 158.9 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 158.9 s | "that" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 195.0 s | "That" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 199.6 s | "there" | *(decoy: not visual)* | ✅ rejected |  |
| held-watch | 270.6 s | "here" | the watch model on the board: the empty gap between the mainspring barrel (right) and the escape wheel and balance (left), where the train wheels are then added | ✅ the black rectangular watch model centered against a gray background *(ready, 0.99)* | ✅ A gap sits empty in the center of the black panel between the left gears and the right gears. *(ready, 0.90)* |

## Visual references found that have no label

Not counted in any metric. Each needs a label (visual or decoy) from a human.

| Clip | Time | Phrase | Sentence | Name It said |
|---|---|---|---|---|
| clip1 | 34.5 s | "it" | Keep folding it like this. | the banana-walnut batter, lumpy pale-yellow with white flour, in the stainless steel mixing bowl left of that jar, with a hand moving inside |
| clip1 | 48.1 s | "it" | You want it to look like this. | the banana-walnut batter, thick and lumpy, on the pink spatula a hand holds in the stainless steel mixing bowl |
| clip3 | 10.5 s | "it" | and tip it in there | the soil, a dark clump on a small hand trowel over a terracotta pot, tipping into the pot |
| clip3 | 22.5 s | "it" | You want it filled up like this. | the terracotta pot containing dark soil to the rim, a hand holds it beside the green and purple leafy plant |
| clip3 | 40.3 s | "it" | hold it right here while it settles. | a small leafy tree plant with green leaves stands upright in the grey pot |
| clip3 | 40.3 s | "it" | hold it right here while it settles. | the small leafy tree plant upright in the grey pot, a hand gripping its stem |
| clip5 | 2.8 s | "it" | fold it corner to corner like this | a patterned square paper the presenter presses into a triangle at the center of the white table |
| clip5 | 11.7 s | "it" | Open it back out so it looks like this | the patterned square paper lies flat at the center of the white table between the presenter's hands |
| clip5 | 11.7 s | "it" | Open it back out so it looks like this | a patterned square paper lies flat at the center of the white table between the presenter's hands |
| held-meat | 161.6 s | "it" | how it looks just like that. Then you simply | the very tender rib eye section, a thick block of raw red meat with white fat that the presenter holds between the presenter's hands on the cutting board |
| held-meat | 165.2 s | "it" | cut it in two for two thick | the very tender rib eye section, a thick marbled red-and-white block centered on the white cutting board; the knife presses down through its middle |
| held-meat | 168.8 s | "it" | Broilable, very tender ribeye steaks. Now this section of the roast this is the less tender part of the roast and it can be prepared as a small pot roast or you could cut it up into stew for stewing beef now with this entire cut let me show you what I did very quickly took away the rib bone cutting as close to the bone as possible then following the natural seam cut out the very tender ribeye section then this less tender part this can be used for stewing beef or as a small pot roast now if you'd like more information on the how to of using this versatile cut or other cuts of beef why not write for this very convenient booklet how to buy beef steaks and its companion how to buy beef roast simply write to agriculture TV Washington DC zip code 20250 so the next time you're shopping to please your family you can also shop to please your pocketbook by buying this very versatile cut of the blade chuck roast and then you can enjoy good eating | the less tender part of the roast, a thick raw red-and-white beef chunk standing upright on the cutting board with the knife blade inserted into the top |
| held-meat | 168.8 s | "it" | Broilable, very tender ribeye steaks. Now this section of the roast this is the less tender part of the roast and it can be prepared as a small pot roast or you could cut it up into stew for stewing beef now with this entire cut let me show you what I did very quickly took away the rib bone cutting as close to the bone as possible then following the natural seam cut out the very tender ribeye section then this less tender part this can be used for stewing beef or as a small pot roast now if you'd like more information on the how to of using this versatile cut or other cuts of beef why not write for this very convenient booklet how to buy beef steaks and its companion how to buy beef roast simply write to agriculture TV Washington DC zip code 20250 so the next time you're shopping to please your family you can also shop to please your pocketbook by buying this very versatile cut of the blade chuck roast and then you can enjoy good eating | the less tender part of the roast, a thick red-and-white beef chunk, stands upright on the cutting board |

