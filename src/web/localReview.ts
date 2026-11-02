// Review decisions kept in this browser (demo mode on the deployed site, where
// the server can't save). Storage can be missing or blocked (private windows),
// so every access is wrapped and failure just means "nothing saved".

import type { ReviewState } from "./bundle";

const key = (videoId: string) => `nameit:review:${videoId}`;

export function loadLocalReview(videoId: string): ReviewState | null {
  try {
    const raw = window.localStorage.getItem(key(videoId));
    return raw ? (JSON.parse(raw) as ReviewState) : null;
  } catch {
    return null;
  }
}

export function saveLocalReview(videoId: string, review: ReviewState): boolean {
  try {
    window.localStorage.setItem(key(videoId), JSON.stringify(review));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalReview(videoId: string): void {
  try {
    window.localStorage.removeItem(key(videoId));
  } catch {
    // nothing to clear
  }
}
