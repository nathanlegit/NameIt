import Link from "next/link";
import { loadIndex } from "@/src/web/loadBundle";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const SPLIT_LABEL = { held_out: "Real narration (held-out)", scripted: "Scripted, synthetic narration", other: "Other" } as const;

export default async function HomePage() {
  const videos = await loadIndex();
  const totalReferences = videos.reduce((total, video) => total + video.references, 0);
  return (
    <section>
      <h1 className="display-1">
        Presenters say <span className="hl">“this”</span>. Name It says <span className="accent">what.</span>
      </h1>

      <ol className="steps">
        <li>
          <span className="step-label">01 — Finds</span>
          <p>
            How-to presenters say “add this” and “until it looks like this”. Blind and low-vision viewers hear the words but not what they
            point at. Name It finds those moments.
          </p>
        </li>
        <li>
          <span className="step-label">02 — Looks</span>
          <p>It looks at the video to work out what “this” is, and writes a short description that fits the pause after the sentence.</p>
        </li>
        <li>
          <span className="step-label">03 — Says</span>
          <p>A volunteer describer reviews the drafts; the player speaks them.</p>
        </li>
      </ol>

      <div className="section-head">
        <h2>Videos</h2>
        <span className="meta">{videos.length} videos · {totalReferences} references</span>
      </div>

      {videos.length === 0 ? (
        <p className="lede" style={{ marginTop: 20 }}>
          No processed videos yet. Run <code>pnpm run pipeline &lt;videoId&gt;</code>, then <code>pnpm export-demo</code>.
        </p>
      ) : (
        <ul className="video-list">
          {videos.map((video, index) => {
            const readyPercent = video.references ? (video.ready / video.references) * 100 : 0;
            const reviewPercent = video.references ? (video.needsReview / video.references) * 100 : 0;
            return (
              <li className="video-row" key={video.id}>
                <div className="main">
                  <span className="num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div className="thumb">
                    {video.thumbUrl ? <img src={video.thumbUrl} alt="" /> : <div className="placeholder" />}
                    <span className="duration"><span className="visually-hidden">Length </span>{formatDuration(video.durationSec)}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3>{video.title}</h3>
                    <p className="credit">{SPLIT_LABEL[video.split]} · {video.attribution}</p>
                  </div>
                </div>
                <div className="stats">
                  <div className="stack" aria-hidden="true">
                    <span className="ready" style={{ width: `${readyPercent}%` }} />
                    <span className="review" style={{ width: `${reviewPercent}%` }} />
                  </div>
                  <span className="meta">
                    {video.references} refs · {video.ready} ready{video.needsReview > 0 ? ` · ${video.needsReview} to review` : ""}
                    {video.abstained > 0 ? ` · ${video.abstained} unsure` : ""}
                  </span>
                </div>
                <div className="actions">
                  <Link className="btn" href={`/review/${video.id}`} aria-label={`Review ${video.title}`}>Review</Link>
                  <Link className="btn primary" href={`/watch/${video.id}`} aria-label={`Watch ${video.title} with descriptions`}>Watch</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
