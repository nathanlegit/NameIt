// Time formatting shared by the player, review queue and video list.

// 75.4 -> "1:15". Whole seconds, rounded down, so it never shows "1:60".
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// 75.4 -> "1 min 15 s": for screen readers (aria-valuetext, announcements).
export function spokenTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}
