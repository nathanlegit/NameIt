import type { Metadata } from "next";
import { percent, type EvalItem, type SplitMetrics, type SystemMetrics } from "@/src/eval/metrics";
import type { BundleItem, VideoBundle } from "@/src/web/bundle";
import { loadBundle, loadEval } from "@/src/web/loadBundle";
import { excerptAround } from "@/src/web/text";
import { EvidenceView } from "../components/EvidenceView";

export const metadata: Metadata = { title: "Evaluation" };

interface EvalFile {
  generatedAt: string;
  metrics: SplitMetrics[];
  items: EvalItem[];
}

const SPLIT_TITLE: Record<string, string> = {
  held_out: "Held-out films · real narration",
  scripted: "Scripted clips · used for tuning",
  all: "All clips",
};

// Which column did better on a metric? Compared on the rounded percentages the
// table shows, so a visible tie (16% vs 16%) is never highlighted as a win.
function better(nameIt: number | null, baseline: number | null, lowerIsBetter = false): "nameIt" | "baseline" | null {
  if (nameIt === null || baseline === null) return null;
  const shownNameIt = Math.round(nameIt * 100);
  const shownBaseline = Math.round(baseline * 100);
  if (shownNameIt === shownBaseline) return null;
  return (shownNameIt < shownBaseline) === lowerIsBetter ? "nameIt" : "baseline";
}

function MetricsTable({ metrics }: { metrics: SplitMetrics }) {
  const rows: Array<{ name: string; target: string; nameIt: string; baseline: string; win: ReturnType<typeof better> }> = [];
  const add = (name: string, target: string, pick: (system: SystemMetrics) => number | null, lowerIsBetter = false, detail?: (system: SystemMetrics) => string) =>
    rows.push({
      name,
      target,
      nameIt: `${percent(pick(metrics.nameIt))}${detail ? ` ${detail(metrics.nameIt)}` : ""}`,
      baseline: `${percent(pick(metrics.baseline))}${detail ? ` ${detail(metrics.baseline)}` : ""}`,
      win: better(pick(metrics.nameIt), pick(metrics.baseline), lowerIsBetter),
    });
  add("Resolution accuracy", "≥ 70%", (system) => system.resolutionAccuracy, false, (system) => `(${system.correct}/${system.answered})`);
  add("Hallucination rate (confident and wrong)", "≤ 10%", (system) => system.hallucinationRate, true);
  add("Precision of “ready” drafts", "≥ 85%", (system) => system.readyPrecision, false, (system) => `(of ${system.ready})`);
  add("Abstention rate", "10 to 25%", (system) => system.abstentionRate);
  // The abstention target is a range, so neither direction is "better": no highlight.
  rows[rows.length - 1]!.win = null;

  // A labelled, focusable scroll region: on a phone the table scrolls sideways
  // inside it (keyboard users can scroll it too) instead of widening the page.
  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label={`${SPLIT_TITLE[metrics.split]}: results table`}>
    <table className="metrics">
      <caption className="visually-hidden">{SPLIT_TITLE[metrics.split]}</caption>
      <thead>
        <tr><th scope="col">Metric</th><th scope="col">Target</th><th scope="col">Name It</th><th scope="col">Baseline, no grounding</th></tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Visual references found (recall / precision)</th>
          <td className="target">≥ 80% / ≥ 75%</td>
          <td colSpan={2}>{percent(metrics.detectionRecall)} / {percent(metrics.detectionPrecision)} (same detector for both)</td>
        </tr>
        {rows.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            <td className="target">{row.target}</td>
            <td className={row.win === "nameIt" ? "win" : undefined}>{row.nameIt}</td>
            <td className={row.win === "baseline" ? "win" : undefined}>{row.baseline}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Unresolved visual references per minute</th>
          <td className="target">lower</td>
          <td>{metrics.unresolvedPerMinuteBefore?.toFixed(1)} → {metrics.nameIt.unresolvedPerMinute?.toFixed(1)}</td>
          <td>{metrics.unresolvedPerMinuteBefore?.toFixed(1)} → {metrics.baseline.unresolvedPerMinute?.toFixed(1)}</td>
        </tr>
        <tr>
          <th scope="row">Inline cues that end before the presenter speaks again</th>
          <td className="target">100%</td>
          <td colSpan={2}>{percent(metrics.cueTimingFit)} ({metrics.inlineCues} inline of {metrics.cues} cues, {metrics.overlaps} overlaps)</td>
        </tr>
      </tbody>
    </table>
    </div>
  );
}

interface Example {
  heading: string;
  explanation: string;
  evalItem: EvalItem;
  bundleItem: BundleItem;
  bundle: VideoBundle;
}

async function findExample(
  items: EvalItem[],
  heading: string,
  explanation: string,
  predicate: (item: EvalItem) => boolean,
): Promise<Example | null> {
  for (const evalItem of items.filter(predicate)) {
    const bundle = await loadBundle(evalItem.videoId);
    const bundleItem = bundle?.items.find((candidate) => candidate.referenceId === evalItem.referenceId);
    if (bundle && bundleItem?.evidence) return { heading, explanation, evalItem, bundleItem, bundle };
  }
  return null;
}

export default async function EvalPage() {
  const data = (await loadEval()) as EvalFile | null;
  if (!data) return <p className="notice">No evaluation yet. Run <code>pnpm eval</code>, then <code>pnpm export-demo</code>.</p>;

  const heldOut = data.items.filter((item) => item.split === "held_out" && item.isVisual && item.detected);
  const examples = (
    await Promise.all([
      findExample(heldOut, "Grounding helps", "Name It names the thing the way the narrator does; the baseline only describes its shape.",
        (item) => item.nameIt?.correct === true && item.nameIt.bucket === "ready" && item.baseline?.correct === false),
      findExample(heldOut, "Flagged for a person", "Name It wasn't confident and sent this to the reviewer instead of speaking it.",
        (item) => item.nameIt?.bucket === "needs_review" && item.nameIt.correct === false),
      findExample(heldOut, "A failure", "Confident and wrong: the kind of error the review step exists to catch.",
        (item) => item.nameIt?.bucket === "ready" && item.nameIt.correct === false),
    ])
  ).filter((example): example is Example => example !== null);

  return (
    <section>
      <h1 className="page-title">Evaluation</h1>
      <p className="lede eval-intro">
        Every visual reference was labelled by hand, then matched against Name It&apos;s answers and a no-grounding baseline: Muse Spark
        sees the same frames and the sentence, without SAM, the glossary or a second look. A language model judge compares answers with
        the labels. The held-out films have real narration and were never used for tuning, so they are the honest numbers; the scripted
        clips use our own narration and flatter the system. Highlighted cells show which system did better. Generated {new Date(data.generatedAt).toUTCString()}.
      </p>

      {data.metrics.filter((metrics) => metrics.videos > 0).map((metrics) => (
        <section key={metrics.split} className="eval-section" aria-labelledby={`split-${metrics.split}`}>
          <div className="section-head">
            <h2 id={`split-${metrics.split}`}>{SPLIT_TITLE[metrics.split]}</h2>
            <span className="meta">
              {metrics.videos} clips · {metrics.minutes.toFixed(1)} min · {metrics.visualLabels} references · {metrics.decoyLabels} decoys
            </span>
          </div>
          <MetricsTable metrics={metrics} />
        </section>
      ))}

      {examples.length > 0 && (
        <section className="eval-section" aria-labelledby="examples-heading">
          <div className="section-head">
            <h2 id="examples-heading">Examples from the held-out films</h2>
          </div>
          <div className="examples">
            {examples.map((example) => {
              const { text, phraseOffset } = example.bundleItem.sentence;
              const excerpt = excerptAround(text, phraseOffset, example.bundleItem.phrase.length, 120);
              return (
                <article className="example" key={example.heading}>
                  <h3>{example.heading}</h3>
                  <p className="context">{example.explanation}</p>
                  <EvidenceView item={example.bundleItem} frameSize={example.bundle.frameSize} showRejected={false} lazy />
                  <p className="said">“{excerpt.before}<mark>{excerpt.phrase}</mark>{excerpt.after}”</p>
                  <dl className="facts">
                    <dt>Label</dt><dd>{example.evalItem.trueReferent}</dd>
                    <dt>Name It</dt><dd>{example.evalItem.nameIt?.text ?? "(abstained)"} <strong>({example.evalItem.nameIt?.correct ? "correct" : "wrong"})</strong></dd>
                    <dt>Baseline</dt><dd>{example.evalItem.baseline?.text ?? "(abstained)"} <strong>({example.evalItem.baseline?.correct ? "correct" : "wrong"})</strong></dd>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
