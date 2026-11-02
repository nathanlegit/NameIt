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

  if (!item) return <p>No visual references were found in this video.</p>;

  const status = itemStatus(item, review);
  const draftForItem = draftText(item);
  const position = `${index + 1} of ${items.length}`;

  return (
    <>
      <div className="review-header">
        <div>
          <h1>Review: {bundle.title}</h1>
          <p className="progress">
            {progress.decided} of {progress.total} reviewed · {progress.approvedUnchanged} approved unchanged · {progress.edited} edited ·{" "}
            {progress.rejected} rejected ·{" "}
            <span>
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved (storage unavailable)" : saveState === "local" ? "Saved in this browser" : "Saved"}
            </span>
          </p>
        </div>
        <div className="actions-row">
          <button type="button" onClick={publish}>{review.publishedAt ? "Published ✓ (publish again)" : "Publish"}</button>
          <Link className="button primary" href={`/watch/${bundle.id}`}>Watch with descriptions</Link>
        </div>
      </div>

      {!canSave && (
        <p className="notice">Demo mode: your decisions are saved in this browser only, and the player on this device uses them.</p>
      )}

      <div className="review-layout">
        <nav aria-label="Items to review">
          <ol className="item-list">
            {items.map((listItem, listIndex) => {
              const listStatus = itemStatus(listItem, review);
              return (
                <li key={listItem.referenceId}>
                  <button type="button" aria-current={listIndex === index ? "true" : undefined} onClick={() => goTo(listIndex)}>
                    <span className="time">{listItem.estimatedTime.toFixed(1)} s</span>
                    <span className="phrase">“{listItem.phrase}”</span>
                    <span className="chips">
                      <span className={`chip ${listStatus}`}>{STATUS_LABEL[listStatus]}</span>
                      {listStatus === "draft" && <span className={`chip ${listItem.resolution.bucket}`}>{BUCKET_LABEL[listItem.resolution.bucket]}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby="evidence-heading">
          <h2 id="evidence-heading" className="visually-hidden">Evidence</h2>
          <EvidenceView item={item} frameSize={bundle.frameSize} />
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
            onTimeUpdate={() => {
              const video = videoRef.current;
              if (video && clipEndRef.current !== null && video.currentTime >= clipEndRef.current) {
                video.pause();
                clipEndRef.current = null;
              }
            }}
          />
        </section>

        <section aria-labelledby="item-heading">
          <div className="panel">
            <h2 id="item-heading">
              Item {position}: “{item.phrase}” <span className={`chip ${status}`}>{STATUS_LABEL[status]}</span>
            </h2>
            {item.previousText && <p className="context">{clip(item.previousText, true)}</p>}
            <p className="sentence"><Sentence item={item} /></p>
            {item.nextText && <p className="context">{clip(item.nextText, false)}</p>}
          </div>

          <div className="panel">
            <h3>What Name It thinks “{item.phrase}” is</h3>
            {item.resolution.bucket === "abstain" || !item.resolution.resolvedText ? (
              <>
                <p className="resolved">Name It wasn&apos;t sure.</p>
                {item.resolution.topCandidates.length > 0 && (
                  <>
                    <p>Its best guesses (choose one to edit it):</p>
                    <div className="candidates">
                      {item.resolution.topCandidates.map((candidate) => (
                        <button key={candidate} type="button" onClick={() => startEdit(candidate)}>{candidate}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="resolved">{item.resolution.resolvedText}</p>
            )}
            <dl className="facts">
              <dt>Kind</dt><dd>{item.kind}</dd>
              <dt>Confidence</dt>
              <dd>
                {item.resolution.confidence.toFixed(2)}{" "}
                <span className={`chip ${item.resolution.bucket}`}>{BUCKET_LABEL[item.resolution.bucket]}</span>
              </dd>
              {item.resolution.secondAnswer && item.resolution.secondAnswer !== item.resolution.resolvedText && (
                <><dt>Second look</dt><dd>{item.resolution.secondAnswer}</dd></>
              )}
              {item.resolution.usedGlossaryEntry && <><dt>Name used in video</dt><dd>{item.resolution.usedGlossaryEntry}</dd></>}
              {item.resolution.confidenceNotes.length > 0 && <><dt>Notes</dt><dd>{item.resolution.confidenceNotes.join("; ")}</dd></>}
              {item.resolution.uncertaintyNote && <><dt>Caveat</dt><dd>{item.resolution.uncertaintyNote}</dd></>}
            </dl>
          </div>

          <div className="panel">
            <h3>Description to speak</h3>
            {item.cue ? (
              <p className="context">
                {item.cue.delivery === "inline"
                  ? `Inline, spoken in the pause at ${item.cue.start.toFixed(1)} s (${item.cue.placementReason}).`
                  : `Extended: the video pauses at ${item.cue.start.toFixed(1)} s (${item.cue.placementReason}).`}
              </p>
            ) : (
              <p className="context">No draft. If you write one, the video pauses after the sentence to speak it.</p>
            )}
            <label htmlFor="cue-text" className="visually-hidden">Description text</label>
            <textarea
              id="cue-text"
              ref={textareaRef}
              value={editing ? draft : currentText(item, review)}
              onFocus={() => { if (!editing) startEdit(); }}
              onChange={(event) => { setEditing(true); setDraft(event.target.value); }}
              aria-describedby="cue-help"
            />
            <p id="cue-help" className="context">
              {editing ? "Enter saves, Shift+Enter adds a line, Esc cancels." : draftForItem && item.cue?.delivery === "inline" ? "Short version (fits the pause)." : ""}
            </p>
            <div className="actions-row">
              <button type="button" className="primary" onClick={editing ? commitEdit : doApprove} aria-keyshortcuts="A">
                {editing ? "Save" : "Approve"} <kbd>{editing ? "Enter" : "A"}</kbd>
              </button>
              <button type="button" onClick={() => startEdit()} aria-keyshortcuts="E">Edit <kbd>E</kbd></button>
              <button type="button" onClick={doReject} aria-keyshortcuts="R">Reject <kbd>R</kbd></button>
              <button type="button" onClick={previewCue} aria-keyshortcuts="P">Preview <kbd>P</kbd></button>
              {status !== "draft" && status !== "abstained" && <button type="button" onClick={doUndo} aria-keyshortcuts="U">Undo <kbd>U</kbd></button>}
            </div>
          </div>

          <p className="shortcuts">
            <kbd>J</kbd> next · <kbd>K</kbd> previous · <kbd>Space</kbd> play the 5 seconds around this moment · <kbd>P</kbd> hear the description
          </p>
        </section>
      </div>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
    </>
  );
}
