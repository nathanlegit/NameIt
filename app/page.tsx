import Link from "next/link";
import { loadIndex } from "@/src/web/loadBundle";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

const SPLIT_LABEL = { held_out: "Real narration (held-out)", scripted: "Scripted (synthetic narration)", other: "Other" } as const;

export default async function HomePage() {
  const videos = await loadIndex();
  return (
    <>
      <h1>Name It</h1>
      <p className="lede">
        How-to presenters say “add this” and “until it looks like this”. Blind and low-vision viewers hear the words but not what
        they point at. Name It finds those moments, looks at the video to work out what “this” is, and writes a short description that
        fits the pause after the sentence. A volunteer describer reviews the drafts; the player speaks them.
      </p>

      {videos.length === 0 ? (
        <p className="notice">No processed videos yet. Run <code>pnpm run pipeline &lt;videoId&gt;</code>, then <code>pnpm export-demo</code>.</p>
      ) : (
        <table className="video-table">
          <caption className="visually-hidden">Processed videos</caption>
          <thead>
            <tr>
              <th scope="col">Video</th>
              <th scope="col">Length</th>
              <th scope="col">References found</th>
              <th scope="col">Drafts</th>
              <th scope="col">Open</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.id}>
                <td>
                  <strong>{video.title}</strong>
                  <div className="credit">{SPLIT_LABEL[video.split]}. {video.attribution}</div>
                </td>
                <td>{formatDuration(video.durationSec)}</td>
                <td>{video.references}</td>
                <td>
                  <span className="chip ready">{video.ready} ready</span>
                  {video.needsReview > 0 && <> <span className="chip needs_review">{video.needsReview} to review</span></>}
                  {video.abstained > 0 && <> <span className="chip abstain">{video.abstained} unsure</span></>}
                </td>
                <td>
                  <div className="actions">
                    <Link className="button" href={`/review/${video.id}`} aria-label={`Review ${video.title}`}>Review</Link>
                    <Link className="button primary" href={`/watch/${video.id}`} aria-label={`Watch ${video.title} with descriptions`}>Watch</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
