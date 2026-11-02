// F10 review actions as pure functions: approve, edit, reject, undo.
// Every change of text is logged as a ReviewEdit (PRD: edits.json), so the eval
// can report "% of drafts approved unchanged".

import type { BundleItem, ReviewDecision, ReviewState, ReviewStatus } from "./bundle";
import { draftText } from "./playback";

export type ItemStatus = ReviewStatus | "draft" | "abstained";

export function itemStatus(item: BundleItem, review: ReviewState): ItemStatus {
  const decision = review.decisions[item.referenceId];
  if (decision) return decision.status;
  return item.cue ? "draft" : "abstained";
}

// The text a reviewer sees in the editor: their own, else the draft, else "".
export function currentText(item: BundleItem, review: ReviewState): string {
  return review.decisions[item.referenceId]?.finalText ?? draftText(item) ?? "";
}

function withDecision(review: ReviewState, referenceId: string, decision: ReviewDecision): ReviewState {
  return { ...review, decisions: { ...review.decisions, [referenceId]: decision } };
}

export function approve(review: ReviewState, item: BundleItem, now: string): ReviewState {
  const text = currentText(item, review).trim();
  if (!text) return review; // nothing to approve: an abstention needs text first
  const wasEdited = review.decisions[item.referenceId]?.status === "edited";
  return withDecision(review, item.referenceId, { status: wasEdited ? "edited" : "approved", finalText: text, at: now });
}

export function saveEdit(review: ReviewState, item: BundleItem, newText: string, now: string): ReviewState {
  const before = currentText(item, review);
  const after = newText.trim();
  if (!after) return review;
  if (after === before.trim()) return approve(review, item, now);
  const logged = { ...review, edits: [...review.edits, { cueId: item.cueId, before, after, at: now }] };
  return withDecision(logged, item.referenceId, { status: "edited", finalText: after, at: now });
}

export function reject(review: ReviewState, item: BundleItem, now: string): ReviewState {
  return withDecision(review, item.referenceId, { status: "rejected", finalText: null, at: now });
}

export function undoDecision(review: ReviewState, item: BundleItem): ReviewState {
  const { [item.referenceId]: _removed, ...rest } = review.decisions;
  return { ...review, decisions: rest };
}

export interface ReviewProgress {
  total: number;
  decided: number;
  approvedUnchanged: number;
  edited: number;
  rejected: number;
}

export function reviewProgress(items: BundleItem[], review: ReviewState): ReviewProgress {
  const statuses = items.map((item) => itemStatus(item, review));
  return {
    total: items.length,
    decided: statuses.filter((status) => status === "approved" || status === "edited" || status === "rejected").length,
    approvedUnchanged: statuses.filter((status) => status === "approved").length,
    edited: statuses.filter((status) => status === "edited").length,
    rejected: statuses.filter((status) => status === "rejected").length,
  };
}
