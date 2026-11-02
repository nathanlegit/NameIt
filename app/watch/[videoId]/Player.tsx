"use client";

// F11: the accessible player.
//
// A plain <video> plus a scheduler. Every animation frame the scheduler reads
// video.currentTime; when playback passes a cue's start it fires the cue:
//   inline:   duck the video to 30% volume and speak in the pause. If the
//             presenter starts talking again before the voice finishes, the
//             video pauses until it does (never talk over the presenter).
//   extended: pause the video, speak, resume.
// Each cue is also written to an aria-live region, for screen readers and
// Braille displays.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoBundle } from "@/src/web/bundle";
import { loadLocalReview } from "@/src/web/localReview";
import {
  cuesCrossed,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  nextSpeechStart,
  playableCues,
  stepRate,
  type PlaybackMode,
  type PlayableCue,
} from "@/src/web/playback";
import { speak, waitForReading, warmUpVoices, type SpeechHandle } from "@/src/web/speech";

const DUCKED_VOLUME = 0.3;
const SEEK_STEP_SEC = 5;
const DEFAULT_RATE = 1.1;

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function spokenTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

export function Player({ bundle }: { bundle: VideoBundle }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [review, setReview] = useState(bundle.review);
  const [mode, setMode] = useState<PlaybackMode>("auto");
  const [descriptionsOn, setDescriptionsOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [playing, setPlaying] = useState(false);   // video playing, or paused only for a description
  const [time, setTime] = useState(0);
  const [description, setDescription] = useState(""); // the aria-live region's text
  const [status, setStatus] = useState("");           // control feedback, also announced

  // Reviews made in this browser (demo mode) win over the exported ones.
  useEffect(() => {
    const local = loadLocalReview(bundle.id);
    if (local) setReview(local);
    warmUpVoices();
  }, [bundle.id]);

  const cues = useMemo(() => playableCues(bundle.items, review, mode), [bundle.items, review, mode]);

  // The animation-frame loop reads these refs, so it always sees current values.
  const cuesRef = useRef(cues);
  const descriptionsOnRef = useRef(descriptionsOn);
  const voiceOnRef = useRef(voiceOn);
  const rateRef = useRef(rate);
  useEffect(() => { cuesRef.current = cues; }, [cues]);
  useEffect(() => { descriptionsOnRef.current = descriptionsOn; }, [descriptionsOn]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { rateRef.current = rate; }, [rate]);

  const lastTimeRef = useRef(0);
  const speakingRef = useRef<SpeechHandle | null>(null);
  const queueRef = useRef<PlayableCue[]>([]);
  const pausedForDescriptionRef = useRef(false);
  const holdAtRef = useRef<number | null>(null);
  const lastCueRef = useRef<PlayableCue | null>(null);

  const restoreVolume = () => {
    if (videoRef.current) videoRef.current.volume = 1;
  };

  // Stop any description without resuming the video (user paused, seeked, or turned descriptions off).
  const stopDescription = useCallback(() => {
    speakingRef.current?.cancel();
    speakingRef.current = null;
    queueRef.current = [];
    holdAtRef.current = null;
    restoreVolume();
  }, []);

  // finishCue and startCue call each other; the ref breaks the cycle.
  const startCueRef = useRef<(cue: PlayableCue) => void>(() => {});

  const finishCue = useCallback(() => {
    speakingRef.current = null;
    holdAtRef.current = null;
    restoreVolume();
    const next = queueRef.current.shift();
    if (next) {
      startCueRef.current(next);
      return;
    }
    if (pausedForDescriptionRef.current) {
      pausedForDescriptionRef.current = false;
      void videoRef.current?.play();
    }
  }, []);

  const startCue = useCallback((cue: PlayableCue) => {
    const video = videoRef.current;
    if (!video) return;
    if (speakingRef.current) {
      queueRef.current.push(cue);
      return;
    }
    lastCueRef.current = cue;
    setDescription(cue.text);
    if (cue.delivery === "extended") {
      pausedForDescriptionRef.current = true;
      video.pause();
      holdAtRef.current = null;
    } else {
      video.volume = DUCKED_VOLUME;
      holdAtRef.current = nextSpeechStart(bundle.turns, cue.start);
    }
    speakingRef.current = voiceOnRef.current
      ? speak(cue.text, rateRef.current, finishCue)
      : waitForReading(cue.text, rateRef.current, finishCue);
  }, [bundle.turns, finishCue]);
  useEffect(() => { startCueRef.current = startCue; }, [startCue]);

  // The scheduler loop.
  useEffect(() => {
    let frame = 0;
    let lastUiUpdate = 0;
    const tick = (now: number) => {
      const video = videoRef.current;
      if (video) {
        const current = video.currentTime;
        if (!video.paused && !video.seeking) {
          if (descriptionsOnRef.current) {
            for (const cue of cuesCrossed(cuesRef.current, lastTimeRef.current, current)) startCue(cue);
          }
          // An inline cue still speaking when the presenter starts again: wait for it.
          if (speakingRef.current && holdAtRef.current !== null && current >= holdAtRef.current - 0.05) {
            pausedForDescriptionRef.current = true;
            holdAtRef.current = null;
            video.pause();
          }
        }
        lastTimeRef.current = current;
        if (now - lastUiUpdate > 250) {
          lastUiUpdate = now;
          setTime(current);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startCue]);

  useEffect(() => () => stopDescription(), [stopDescription]);

  // ---- Controls ----

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused || pausedForDescriptionRef.current) {
      pausedForDescriptionRef.current = false;
      stopDescription();
      video.pause();
      setPlaying(false);
    } else {
      void video.play();
    }
  }, [stopDescription]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), bundle.durationSec);
    setStatus(`${delta > 0 ? "Forward" : "Back"} ${Math.abs(delta)} seconds, at ${spokenTime(video.currentTime)}`);
  }, [bundle.durationSec]);

  const repeatLast = useCallback(() => {
    const cue = lastCueRef.current;
    if (!cue) {
      setStatus("No description yet");
      return;
    }
    stopDescription();
    const video = videoRef.current;
    if (video && !video.paused) {
      pausedForDescriptionRef.current = true;
      video.pause();
    }
    setDescription("");
    window.setTimeout(() => setDescription(cue.text), 50); // re-announce even if the text is unchanged
    speakingRef.current = voiceOnRef.current ? speak(cue.text, rateRef.current, finishCue) : waitForReading(cue.text, rateRef.current, finishCue);
  }, [finishCue, stopDescription]);

  const changeRate = useCallback((direction: 1 | -1) => {
    setRate((current) => {
      const next = stepRate(current, direction);
      setStatus(`Description speed ${next.toFixed(1)}`);
      return next;
    });
  }, []);

  const toggleDescriptions = useCallback(() => {
    setDescriptionsOn((current) => {
      if (current) {
        const wasWaiting = pausedForDescriptionRef.current;
        stopDescription();
        if (wasWaiting) {
          pausedForDescriptionRef.current = false;
          void videoRef.current?.play();
        }
      }
      setStatus(current ? "Descriptions off" : "Descriptions on");
      return !current;
    });
  }, [stopDescription]);

  // Keyboard: Space play/pause, D repeat, M descriptions on/off, [ ] speed, ← → seek 5 s.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && (target as HTMLInputElement).type !== "range")) return;
      const onButton = tag === "BUTTON" || tag === "A";
      const onRange = tag === "INPUT";
      switch (event.key) {
        case " ":
          if (onButton) return; // let the focused button do its own thing
          event.preventDefault();
          togglePlay();
          break;
        case "d": case "D": event.preventDefault(); repeatLast(); break;
        case "m": case "M": event.preventDefault(); toggleDescriptions(); break;
        case "[": event.preventDefault(); changeRate(-1); break;
        case "]": event.preventDefault(); changeRate(1); break;
        case "ArrowLeft": if (!onRange) { event.preventDefault(); seekBy(-SEEK_STEP_SEC); } break;
        case "ArrowRight": if (!onRange) { event.preventDefault(); seekBy(SEEK_STEP_SEC); } break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeRate, repeatLast, seekBy, toggleDescriptions, togglePlay]);

  const reviewedCount = cues.filter((cue) => cue.reviewed).length;
  const unreviewedCount = cues.length - reviewedCount;

  return (
    <div className="player">
      <video
        ref={videoRef}
        src={bundle.videoUrl}
        preload="auto"
        playsInline
        aria-label={`Video: ${bundle.title}`}
        onPlay={() => setPlaying(true)}
        onPause={() => { if (!pausedForDescriptionRef.current) setPlaying(false); }}
        onEnded={() => { setPlaying(false); setStatus("Video ended"); }}
        onSeeking={() => {
          stopDescription();
          if (pausedForDescriptionRef.current) {
            pausedForDescriptionRef.current = false;
            setPlaying(false);
          }
        }}
        onSeeked={() => { lastTimeRef.current = videoRef.current?.currentTime ?? 0; }}
        onClick={togglePlay}
      />

      <div className="description-box">
        <span className="label">Description</span>
        <span aria-live="polite" aria-atomic="true">{descriptionsOn ? description : ""}</span>
      </div>

      <div className="seek">
        <span className="time" aria-hidden="true">{formatTime(time)}</span>
        <input
          type="range"
          min={0}
          max={bundle.durationSec}
          step={0.1}
          value={time}
          aria-label="Seek"
          aria-valuetext={`${spokenTime(time)} of ${spokenTime(bundle.durationSec)}`}
          onChange={(event) => {
            const video = videoRef.current;
            if (video) video.currentTime = Number(event.target.value);
            setTime(Number(event.target.value));
          }}
        />
        <span className="time" aria-hidden="true">{formatTime(bundle.durationSec)}</span>
      </div>

      <div className="controls" role="group" aria-label="Playback controls">
        {/* Focus starts on Play (PRD 7.2). */}
        <button type="button" className="primary" onClick={togglePlay} autoFocus aria-keyshortcuts="Space">
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => seekBy(-SEEK_STEP_SEC)} aria-keyshortcuts="ArrowLeft">Back 5 s</button>
        <button type="button" onClick={() => seekBy(SEEK_STEP_SEC)} aria-keyshortcuts="ArrowRight">Forward 5 s</button>
        <button type="button" onClick={repeatLast} aria-keyshortcuts="D">Repeat description</button>
        <button type="button" onClick={toggleDescriptions} aria-pressed={descriptionsOn} aria-keyshortcuts="M">Descriptions</button>
        <button type="button" onClick={() => changeRate(-1)} aria-keyshortcuts="[" disabled={rate <= MIN_SPEECH_RATE}>Slower</button>
        <button type="button" onClick={() => changeRate(1)} aria-keyshortcuts="]" disabled={rate >= MAX_SPEECH_RATE}>Faster</button>
        <span aria-hidden="true">Speed {rate.toFixed(1)}</span>
      </div>

      <div className="settings">
        <fieldset>
          <legend>Which descriptions</legend>
          <label>
            <input type="radio" name="mode" checked={mode === "auto"} onChange={() => setMode("auto")} />{" "}
            Reviewed, plus drafts Name It is confident about
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === "reviewed"} onChange={() => setMode("reviewed")} />{" "}
            Reviewed by a person only
          </label>
        </fieldset>
        <fieldset>
          <legend>Voice</legend>
          <label>
            <input type="checkbox" checked={voiceOn} onChange={(event) => setVoiceOn(event.target.checked)} />{" "}
            Speak descriptions with the built-in voice (turn off to use your screen reader only)
          </label>
        </fieldset>
      </div>

      <p className="lede" style={{ marginTop: 16 }}>
        {cues.length} descriptions will play: {reviewedCount} reviewed by a person
        {unreviewedCount > 0 ? `, ${unreviewedCount} unreviewed drafts Name It is confident about` : ""}.
      </p>

      <p className="shortcuts">
        Keys: <kbd>Space</kbd> play or pause, <kbd>D</kbd> repeat description, <kbd>M</kbd> descriptions on or off,{" "}
        <kbd>[</kbd> <kbd>]</kbd> description speed, <kbd>←</kbd> <kbd>→</kbd> back or forward 5 seconds.
      </p>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">{status}</div>
    </div>
  );
}
