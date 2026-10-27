"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "./cn";

/**
 * A soft, synthesized click on taps (buttons, links, choices) — no audio files
 * to download. Choices that switch on get a slightly brighter "pop". Visitors
 * can mute it; the choice is remembered in this browser.
 *
 * Phones: browsers only allow sound that starts inside a real tap, so the audio
 * is unlocked on `touchend`/`click` and the click plays on `click` (Safari
 * ignores audio started on `pointerdown`). On iPhone the sound follows the
 * silent switch, like the phone's own keyboard clicks, and mixes with music
 * instead of pausing it.
 */

const STORAGE_KEY = "asd-sound";
const listeners = new Set<() => void>();
let muted: boolean | null = null;
let context: AudioContext | null = null;

function readMuted(): boolean {
  if (muted !== null) return muted;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    muted = false;
  }
  return muted;
}

function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "off" : "on");
  } catch {
    // Storage blocked — the choice lasts for this visit.
  }
  listeners.forEach((listener) => listener());
}

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    // Safari 16.4+: mix with other audio (music keeps playing) and follow the silent switch.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
    context = new Ctor({ latencyHint: "interactive" });
  } catch {
    return null;
  }
  return context;
}

/** Resume the audio context inside a user gesture (required on iOS and Android). */
function unlock() {
  const ctx = audio();
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
}

export function playClick(kind: "tap" | "select" = "tap") {
  if (typeof window === "undefined" || readMuted()) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state !== "running") void ctx.resume().catch(() => {});
  const now = ctx.currentTime + 0.005;

  // A short tone for the "body" of the click…
  const osc = ctx.createOscillator();
  const tone = ctx.createGain();
  osc.type = "triangle";
  const [from, to] = kind === "select" ? [1250, 820] : [820, 480];
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + 0.045);
  tone.gain.setValueAtTime(0.0001, now);
  tone.gain.exponentialRampToValueAtTime(kind === "select" ? 0.22 : 0.18, now + 0.004);
  tone.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(tone).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);

  // …and a tiny burst of filtered noise for the "tick" phone speakers reproduce well.
  const length = Math.floor(ctx.sampleRate * 0.012);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = kind === "select" ? 3200 : 2400;
  const tick = ctx.createGain();
  tick.gain.value = 0.25;
  noise.connect(filter).connect(tick).connect(ctx.destination);
  noise.start(now);
}

const CLICKABLE = 'button, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], summary, input[type="checkbox"], input[type="radio"]';

/** Mount once per page: plays the click for every tap on an interactive element. */
export function ClickSound() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.(CLICKABLE) as HTMLElement | null;
      if (!target || target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true" || target.closest("[data-silent]")) return;
      // Runs in the capture phase, before React's handler: aria-checked is still the state before the tap.
      const choice = target.getAttribute("role");
      const selecting = (choice === "checkbox" || choice === "radio" || choice === "switch" || choice === "option") && target.getAttribute("aria-checked") !== "true";
      playClick(selecting ? "select" : "tap");
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("touchend", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("touchend", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A small speaker toggle for the header. */
export function SoundToggle({ className }: { className?: string }) {
  const isMuted = useSyncExternalStore(subscribe, readMuted, () => false);
  return (
    <button
      type="button"
      data-silent
      onClick={() => {
        setMuted(!isMuted);
        if (isMuted) playClick("select");
      }}
      aria-pressed={!isMuted}
      aria-label={isMuted ? "تشغيل صوت النقرات" : "إيقاف صوت النقرات"}
      title={isMuted ? "تشغيل الصوت" : "إيقاف الصوت"}
      className={cn(
        "grid size-9 place-items-center rounded-full border border-line/10 bg-line/[0.03] text-mist transition hover:border-line/25 hover:text-ivory",
        className,
      )}
    >
      {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}
