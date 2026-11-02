"use client";

// F10: the describer's review queue, built for the keyboard.
//   A approve · E edit (Enter saves, Esc cancels) · R reject · U undo
//   J next · K previous · Space play the 5 s around the item · P preview the cue aloud
// Approving or rejecting moves to the next item, so a reviewer can go A, A, R, A...
// Decisions are saved to data/videos/<id>/review.json locally, or kept in this
// browser on the deployed demo.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BundleItem, ReviewState, VideoBundle } from "@/src/web/bundle";
import { loadLocalReview, saveLocalReview } from "@/src/web/localReview";
import { draftText } from "@/src/web/playback";
import { approve, currentText, itemStatus, reject, reviewProgress, saveEdit, undoDecision, type ItemStatus } from "@/src/web/review";
import { speak, warmUpVoices, type SpeechHandle } from "@/src/web/speech";
import { excerptAround } from "@/src/web/text";
import { EvidenceView } from "../../components/EvidenceView";

const CLIP_HALF_SEC = 2.5;

const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: "Draft",
  abstained: "Name It wasn't sure",
  approved: "Approved",
  edited: "Edited",
  rejected: "Rejected",
};

const BUCKET_LABEL = { ready: "Ready", needs_review: "Needs review", abstain: "Unsure" } as const;

// Status colours (warm redesign): the dot beside each item and the progress cells.
const STATUS_COLOUR: Record<ItemStatus, string> = {
  draft: "var(--draft)",
  abstained: "var(--red-text)",
  approved: "var(--green)",
  edited: "var(--amber)",
  rejected: "var(--red)",
};
const BUCKET_COLOUR = { ready: "var(--green)", needs_review: "var(--amber)", abstain: "var(--red-text)" } as const;

// A draft Name It wasn't confident about is shown as "Check", so it stands out in the list.
function listStatus(item: BundleItem, status: ItemStatus): { label: string; colour: string } {
  if (status === "draft" && item.resolution.bucket === "needs_review") return { label: "Check", colour: "var(--amber)" };
  if (status === "abstained") return { label: "Unsure", colour: STATUS_COLOUR.abstained };
  return { label: STATUS_LABEL[status], colour: STATUS_COLOUR[status] };
}

function Sentence({ item }: { item: BundleItem }) {
  const { text, phraseOffset } = item.sentence;
  const matches = text.slice(phraseOffset, phraseOffset + item.phrase.length).toLowerCase() === item.phrase.toLowerCase();
  if (!matches) return <span>{text}</span>;
  const excerpt = excerptAround(text, phraseOffset, item.phrase.length);
  return (
    <span>
      {excerpt.before}
      <mark>{excerpt.phrase}</mark>
      {excerpt.after}
    </span>
  );
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

// Neighbouring turns can be minutes long too: show only the part nearest the item.
function clip(text: string, fromEnd: boolean, limit = 200): string {
  if (text.length <= limit) return text;
  return fromEnd ? `…${text.slice(-limit).replace(/^\S*\s/, "")}` : `${text.slice(0, limit).replace(/\s\S*$/, "")}…`;
}

export function ReviewApp({ bundle, canSave }: { bundle: VideoBundle; canSave: boolean }) {
  const items = bundle.items;
  const [review, setReview] = useState<ReviewState>(bundle.review);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error" | "local">(canSave ? "saved" : "local");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipEndRef = useRef<number | null>(null);
  const previewRef = useRef<SpeechHandle | null>(null);

  const item = items[index];

  useEffect(() => {
    warmUpVoices();
    if (!canSave) {
      const local = loadLocalReview(bundle.id);
      if (local) setReview(local);
    }
  }, [bundle.id, canSave]);

  // Keep the editor in step with the selected item, and cue the clip player to its moment.
  useEffect(() => {
    if (item) setDraft(currentText(item, review));
    setEditing(false);
    const video = videoRef.current;
    if (video && item) {
      video.pause();
      clipEndRef.current = null;
      video.currentTime = Math.max(0, item.refinedTime - CLIP_HALF_SEC);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const persist = useCallback(async (next: ReviewState) => {
    setReview(next);
    if (!canSave) {
      setSaveState(saveLocalReview(bundle.id, next) ? "local" : "error");
      return;
    }
    setSaveState("saving");
    try {
      const response = await fetch(`/api/review/${bundle.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaveState(response.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [bundle.id, canSave]);

  const describeItem = useCallback((target: BundleItem, position: number) => {
    const status = STATUS_LABEL[itemStatus(target, review)];
    return `Item ${position + 1} of ${items.length}: “${target.phrase}” at ${target.estimatedTime.toFixed(1)} seconds. ${status}. ${
      target.resolution.resolvedText ?? "No answer"
    }.`;
  }, [items.length, review]);

  const goTo = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= items.length) {
      setAnnouncement(nextIndex < 0 ? "First item" : "Last item");
      return;
    }
    setIndex(nextIndex);
    setAnnouncement(describeItem(items[nextIndex]!, nextIndex));
  }, [describeItem, items]);

  const now = () => new Date().toISOString();

  const doApprove = useCallback(() => {
    if (!item) return;
    const next = approve(review, item, now());
    if (next === review) {
      setAnnouncement("Nothing to approve yet: type a description first (E).");
      return;
    }
    void persist(next);
    setAnnouncement("Approved.");
    goTo(index + 1);
  }, [goTo, index, item, persist, review]);

  const doReject = useCallback(() => {
    if (!item) return;
    void persist(reject(review, item, now()));
    setAnnouncement("Rejected: this description will not be spoken.");
    goTo(index + 1);
  }, [goTo, index, item, persist, review]);

  const doUndo = useCallback(() => {
    if (!item) return;
    void persist(undoDecision(review, item));
    setDraft(currentText(item, undoDecision(review, item)));
    setAnnouncement("Decision undone.");
  }, [item, persist, review]);

  const startEdit = useCallback((prefill?: string) => {
    if (prefill !== undefined) setDraft(prefill);
    setEditing(true);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (!item) return;
    const next = saveEdit(review, item, draft, now());
    if (next === review) {
      setAnnouncement("The description is empty.");
      return;
    }
    void persist(next);
    setEditing(false);
    // Leave the editor, or the next shortcut (A, R, J...) would be typed into it.
    textareaRef.current?.blur();
    setAnnouncement(itemStatus(item, next) === "edited" ? "Edit saved." : "Approved.");
    goTo(index + 1);
  }, [draft, goTo, index, item, persist, review]);

  const cancelEdit = useCallback(() => {
    if (item) setDraft(currentText(item, review));
    setEditing(false);
    textareaRef.current?.blur();
    setAnnouncement("Edit cancelled.");
  }, [item, review]);

  const playClip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !item) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    const center = item.refinedTime;
    video.currentTime = Math.max(0, center - CLIP_HALF_SEC);
    clipEndRef.current = Math.min(bundle.durationSec, center + CLIP_HALF_SEC);
    void video.play();
  }, [bundle.durationSec, item]);

  const previewCue = useCallback(() => {
    if (!item) return;
    previewRef.current?.cancel();
    const text = (editing ? draft : currentText(item, review)).trim();
    if (!text) {
      setAnnouncement("No description to preview.");
      return;
    }
    previewRef.current = speak(text, 1.1, () => { previewRef.current = null; });
  }, [draft, editing, item, review]);

  // Keyboard shortcuts (not while typing in the editor).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA") {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitEdit(); }
        if (event.key === "Escape") { event.preventDefault(); cancelEdit(); }
        return;
      }
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      const onButton = target?.tagName === "BUTTON" || target?.tagName === "A";
      switch (event.key) {
        case "a": case "A": event.preventDefault(); doApprove(); break;
        case "e": case "E": event.preventDefault(); startEdit(); break;
        case "r": case "R": event.preventDefault(); doReject(); break;
        case "u": case "U": event.preventDefault(); doUndo(); break;
        case "j": case "J": event.preventDefault(); goTo(index + 1); break;
        case "k": case "K": event.preventDefault(); goTo(index - 1); break;
        case "p": case "P": event.preventDefault(); previewCue(); break;
        case " ": if (!onButton) { event.preventDefault(); playClip(); } break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelEdit, commitEdit, doApprove, doReject, doUndo, goTo, index, playClip, previewCue, startEdit]);

  const progress = useMemo(() => reviewProgress(items, review), [items, review]);

  const publish = useCallback(() => {
    void persist({ ...review, publishedAt: now() });
    setAnnouncement("Published. The player now uses your reviewed descriptions.");
  }, [persist, review]);

  if (!item) return <p className="lede">No visual references were found in this video.</p>;

  const status = itemStatus(item, review);
  const shown = listStatus(item, status);
  const draftForItem = draftText(item);
  const position = `${index + 1} of ${items.length}`;
  const filledCells = Math.round(item.resolution.confidence * 10);
  const saveText =
    saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved (storage unavailable)" : saveState === "local" ? "Saved in this browser" : "Saved";

  return (
    <section>
      <div className="review-top">
        <div className="left">
          <h1 className="page-title">Review: {bundle.title}</h1>
          <div className="progress-row">
            <div className="cells" aria-hidden="true">
              {items.map((cellItem, cellIndex) => {
                const cellStatus = itemStatus(cellItem, review);
                const decided = cellStatus !== "draft" && cellStatus !== "abstained";
                return (
                  <span
                    key={cellItem.referenceId}
                    className={cellIndex === index ? "current" : undefined}
                    style={decided ? { background: STATUS_COLOUR[cellStatus] } : undefined}
                  />
                );
              })}
            </div>
            <span className="progress-text">
              {progress.decided}/{progress.total} reviewed · {progress.approvedUnchanged} approved · {progress.edited} edited · {progress.rejected} rejected · {saveText}
            </span>
          </div>
        </div>
        <div className="actions-row">
          <button type="button" className="btn" onClick={publish}>{review.publishedAt ? "Published ✓" : "Publish"}</button>
          <Link className="btn primary" href={`/watch/${bundle.id}`}>Watch with descriptions</Link>
        </div>
      </div>

      <div className="review-grid">
        <nav aria-label="Items to review" className="item-nav">
          {!canSave && <p className="notice">Demo mode: decisions are saved in this browser only, and the player on this device uses them.</p>}
          <ol className="item-list">
            {items.map((listItem, listIndex) => {
              const entry = listStatus(listItem, itemStatus(listItem, review));
              return (
                <li key={listItem.referenceId}>
                  <button type="button" aria-current={listIndex === index ? "true" : undefined} onClick={() => goTo(listIndex)}>
                    <span className="time">{formatClock(listItem.estimatedTime)}</span>
                    <span className="phrase">“{listItem.phrase}”</span>
                    <span className="status"><span className="dot" style={{ background: entry.colour }} />{entry.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="evidence-col">
          <h2 className="visually-hidden">Evidence</h2>
          <EvidenceView item={item} frameSize={bundle.frameSize} />
          <div className="evidence-caption">
            <p>Frame at {item.refinedTime.toFixed(1)} s · green: the object Name It chose</p>
            <button type="button" className="btn small" onClick={previewCue} aria-keyshortcuts="P">Hear it <span className="key">P</span></button>
          </div>
          {item.evidence && (
            <ul className="reasons" aria-label="Why this object was chosen">
              {item.evidence.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          <video
            ref={videoRef}
            className="clip-video"
            src={bundle.videoUrl}
            preload="metadata"
            playsInline
            controls
            aria-label={`Video around this moment. Press Space to play the 5 seconds around item ${position}.`}
            // A seek before the metadata has loaded is ignored, so cue the first item again here.
            onLoadedMetadata={() => {
              const video = videoRef.current;
              if (video && clipEndRef.current === null) video.currentTime = Math.max(0, item.refinedTime - CLIP_HALF_SEC);
            }}
            onTimeUpdate={() => {
              const video = videoRef.current;
              if (video && clipEndRef.current !== null && video.currentTime >= clipEndRef.current) {
                video.pause();
                clipEndRef.current = null;
              }
            }}
          />
        </div>

        <div className="detail-col">
          <div className="detail-block">
            <div className="detail-head">
              <h2 className="meta" style={{ margin: 0 }}>Item {position}</h2>
              <span className="status"><span className="dot" style={{ background: shown.colour }} />{shown.label}</span>
            </div>
            {item.previousText && <p className="context">{clip(item.previousText, true)}</p>}
            <p className="sentence"><Sentence item={item} /></p>
            {item.nextText && <p className="context">{clip(item.nextText, false)}</p>}
          </div>

          <div className="detail-block">
            <h3>Name It thinks “{item.phrase}” is</h3>
            {item.resolution.bucket === "abstain" || !item.resolution.resolvedText ? (
              <>
                <p className="resolved">Name It wasn&apos;t sure.</p>
                {item.resolution.topCandidates.length > 0 && (
                  <>
                    <p className="context">Its best guesses (choose one to edit it):</p>
                    <div className="candidates">
                      {item.resolution.topCandidates.map((candidate) => (
                        <button key={candidate} type="button" className="btn small" onClick={() => startEdit(candidate)}>{candidate}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="resolved">{item.resolution.resolvedText}</p>
            )}
            <dl className="facts">
              <dt>Kind</dt><dd className="mono">{item.kind}</dd>
              <dt>Confidence</dt>
              <dd className="conf">
                <span className="conf-cells" aria-hidden="true">
                  {Array.from({ length: 10 }, (_, cell) => (
                    <span key={cell} style={cell < filledCells ? { background: BUCKET_COLOUR[item.resolution.bucket] } : undefined} />
                  ))}
                </span>
                <span className="value">{item.resolution.confidence.toFixed(2)}</span>
                <span className={`bucket bucket-${item.resolution.bucket}`}>{BUCKET_LABEL[item.resolution.bucket]}</span>
              </dd>
              {item.resolution.secondAnswer && item.resolution.secondAnswer !== item.resolution.resolvedText && (
                <><dt>Second look</dt><dd>{item.resolution.secondAnswer}</dd></>
              )}
              {item.resolution.usedGlossaryEntry && <><dt>Name in video</dt><dd>{item.resolution.usedGlossaryEntry}</dd></>}
              {item.resolution.confidenceNotes.length > 0 && <><dt>Notes</dt><dd>{item.resolution.confidenceNotes.join("; ")}</dd></>}
              {item.resolution.uncertaintyNote && <><dt>Caveat</dt><dd>{item.resolution.uncertaintyNote}</dd></>}
            </dl>
          </div>

          <div className="detail-block">
            <div className="detail-head">
              <label htmlFor="cue-text" className="cue-label">Description to speak</label>
              <span className="cue-delivery">
                {item.cue
                  ? item.cue.delivery === "inline"
                    ? `Inline, in the pause at ${item.cue.start.toFixed(1)} s`
                    : `Extended: video pauses at ${item.cue.start.toFixed(1)} s`
                  : "No draft: the video will pause after the sentence"}
              </span>
            </div>
            <textarea
              id="cue-text"
              ref={textareaRef}
              className={editing ? "editing" : undefined}
              value={editing ? draft : currentText(item, review)}
              onFocus={() => { if (!editing) startEdit(); }}
              onChange={(event) => { setEditing(true); setDraft(event.target.value); }}
              aria-describedby="cue-help"
            />
            <p id="cue-help" className="hint">
              {editing
                ? "Enter saves · Shift+Enter new line · Esc cancels"
                : item.cue
                  ? `${item.cue.placementReason}${draftForItem && item.cue.delivery === "inline" ? " · short version, fits the pause" : ""}`
                  : ""}
            </p>
            <div className="actions-row">
              <button type="button" className="btn approve" onClick={editing ? commitEdit : doApprove} aria-keyshortcuts="A">
                {editing ? "Save" : "Approve"} <span className="key">{editing ? "Enter" : "A"}</span>
              </button>
              <button type="button" className="btn" onClick={() => startEdit()} aria-keyshortcuts="E">Edit <span className="key">E</span></button>
              <button type="button" className="btn danger" onClick={doReject} aria-keyshortcuts="R">Reject <span className="key">R</span></button>
              {status !== "draft" && status !== "abstained" && (
                <button type="button" className="btn link" onClick={doUndo} aria-keyshortcuts="U">Undo <span className="key">U</span></button>
              )}
            </div>
            <p className="shortcuts">J next · K previous · Space play the 5 s around it · P hear the description</p>
          </div>
        </div>
      </div>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
    </section>
  );
}
