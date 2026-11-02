import type { Metadata } from "next";
import type { EvalItem, SplitMetrics, SystemMetrics } from "@/src/eval/metrics";
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
  held_out: "Held-out films: real narration, never used for tuning",
  scripted: "Scripted clips: our narration, used for tuning (flatters the system)",
  all: "All clips",
};

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

// Which column did better on a metric? (lower is better for hallucination)
function better(nameIt: number | null, baseline: number | null, lowerIsBetter = false): "nameIt" | "baseline" | null {
  if (nameIt === null || baseline === null || nameIt === baseline) return null;
  return (nameIt < baseline) === lowerIsBetter ? "nameIt" : "baseline";
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

  return (
    <table className="metrics">
      <caption className="visually-hidden">{SPLIT_TITLE[metrics.split]}</caption>
      <thead>
        <tr><th scope="col">Metric</th><th scope="col">Target</th><th scope="col">Name It</th><th scope="col">Baseline (no grounding)</th></tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Visual references found (recall / precision)</th>
          <td>≥ 80% / ≥ 75%</td>
          <td colSpan={2}>{percent(metrics.detectionRecall)} / {percent(metrics.detectionPrecision)} (same detector for both)</td>
        </tr>
        {rows.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            <td>{row.target}</td>
            <td className={row.win === "nameIt" ? "win" : undefined}>{row.nameIt}</td>
            <td className={row.win === "baseline" ? "win" : undefined}>{row.baseline}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">Unresolved visual references per minute</th>
          <td>lower</td>
          <td>{metrics.unresolvedPerMinuteBefore?.toFixed(1)} → {metrics.nameIt.unresolvedPerMinute?.toFixed(1)}</td>
          <td>{metrics.unresolvedPerMinuteBefore?.toFixed(1)} → {metrics.baseline.unresolvedPerMinute?.toFixed(1)}</td>
        </tr>
        <tr>
          <th scope="row">Inline cues that end before the presenter speaks again</th>
          <td>100%</td>
          <td colSpan={2}>{percent(metrics.cueTimingFit)} ({metrics.inlineCues} inline of {metrics.cues} cues, {metrics.overlaps} overlaps)</td>
        </tr>
      </tbody>
    </table>
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
    <>
      <h1>Evaluation</h1>
      <p className="lede">
        Every visual reference was labelled by hand, then matched against Name It&apos;s answers and a no-grounding baseline (Muse Spark
        sees the same frames and the sentence, without SAM, the glossary or a second look). A language model judge compares answers with
        the labels. Generated {new Date(data.generatedAt).toUTCString()}.
      </p>

      {data.metrics.filter((metrics) => metrics.videos > 0).map((metrics) => (
        <section key={metrics.split} aria-labelledby={`split-${metrics.split}`}>
          <h2 id={`split-${metrics.split}`}>{SPLIT_TITLE[metrics.split]}</h2>
          <p className="context">
            {metrics.videos} clips, {metrics.minutes.toFixed(1)} minutes, {metrics.visualLabels} visual references, {metrics.decoyLabels} decoys.
          </p>
          <MetricsTable metrics={metrics} />
        </section>
      ))}

      {examples.length > 0 && (
        <section aria-labelledby="examples-heading">
          <h2 id="examples-heading">Examples from the held-out films</h2>
          <div className="examples">
            {examples.map((example) => (
              <article className="example" key={example.heading}>
                <h3>{example.heading}</h3>
                <p className="context">{example.explanation}</p>
                <EvidenceView item={example.bundleItem} frameSize={example.bundle.frameSize} showRejected={false} />
                <p>
                  {(() => {
                    const { text, phraseOffset } = example.bundleItem.sentence;
                    const excerpt = excerptAround(text, phraseOffset, example.bundleItem.phrase.length, 120);
                    return <>“{excerpt.before}<mark>{excerpt.phrase}</mark>{excerpt.after}”</>;
                  })()}
                </p>
                <dl className="facts">
                  <dt>Label</dt><dd>{example.evalItem.trueReferent}</dd>
                  <dt>Name It</dt><dd>{example.evalItem.nameIt?.text ?? "(abstained)"} ({example.evalItem.nameIt?.correct ? "correct" : "wrong"})</dd>
                  <dt>Baseline</dt><dd>{example.evalItem.baseline?.text ?? "(abstained)"} ({example.evalItem.baseline?.correct ? "correct" : "wrong"})</dd>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
