"use client";

import { Mic, Square, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

/**
 * Records a short voice note, transcribes it with Whisper (via
 * /api/v1/transcribe) and hands the recognised text to the caller — who
 * drops it straight into the brief's description, so speaking the project
 * over reaches the same AI analysis as typing it. Auto-detects English and
 * Arabic (Gulf/Lebanese), no language picker needed.
 */

type Status = "idle" | "recording" | "processing" | "error";

const BAR_COUNT = 28;
const MAX_SECONDS = 180;

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceRecorder({ onTranscript, className }: VoiceRecorderProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [awaitingPermission, setAwaitingPermission] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.06));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopVisualizer = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stopVisualizer();
    stopTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [stopVisualizer, stopTimer]);

  useEffect(() => cleanup, [cleanup]);

  function draw() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const next: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      next.push(Math.max(0.06, (data[i * step] ?? 0) / 255));
    }
    setLevels(next);
    frameRef.current = requestAnimationFrame(draw);
  }

  const transcribe = useCallback(
    async (blob: Blob) => {
      setStatus("processing");
      try {
        const body = new FormData();
        body.append("audio", blob, `voice-note.${blob.type.includes("ogg") ? "ogg" : "webm"}`);
        const res = await fetch("/api/v1/transcribe", { method: "POST", body });
        const data = (await res.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
        if (!res.ok || !data?.text) {
          throw new Error(data?.error?.message ?? "تعذّر التفريغ الصوتي — الرجاء المحاولة مجدداً.");
        }
        onTranscript(data.text);
        setStatus("idle");
        setSeconds(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذّر التفريغ الصوتي — الرجاء المحاولة مجدداً.");
        setStatus("error");
      }
    },
    [onTranscript],
  );

  const start = useCallback(async () => {
    setError(null);

    // If the browser already knows the mic is blocked, say so immediately —
    // getUserMedia would reject silently with no native prompt to point at.
    try {
      const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (permission.state === "denied") {
        setStatus("error");
        setError("الميكروفون محظور لهذا الموقع — اضغط أيقونة القفل/معلومات الموقع في شريط عنوان المتصفح، اسمح بالميكروفون، ثم حاول مجدداً.");
        return;
      }
    } catch {
      // Permissions API doesn't support "microphone" in this browser (e.g. Safari) — fall through to getUserMedia.
    }

    setAwaitingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAwaitingPermission(false);
      streamRef.current = stream;

      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      frameRef.current = requestAnimationFrame(draw);

      const mimeType = ["audio/webm", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        void transcribe(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();

      setSeconds(0);
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) {
            mediaRecorderRef.current?.stop();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      setAwaitingPermission(false);
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("لم يتم العثور على ميكروفون في هذا الجهاز.");
      } else {
        setError("تم حظر الوصول إلى الميكروفون — اضغط أيقونة القفل/معلومات الموقع في شريط عنوان المتصفح، اسمح بالميكروفون، ثم حاول مجدداً.");
      }
      setStatus("error");
      cleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw only reads refs and a stable setState
  }, [cleanup, transcribe]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const discard = useCallback(() => {
    cleanup();
    chunksRef.current = [];
    setStatus("idle");
    setSeconds(0);
    setError(null);
  }, [cleanup]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className={cn("rounded-2xl border border-line/[0.08] bg-line/[0.02] p-4", className)}>
      <div className="flex items-center gap-3">
        <div className="relative">
          {awaitingPermission ? (
            <div
              role="status"
              className="absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-ember-400/40 bg-ink-850 px-3 py-2 text-center text-[12px] leading-snug text-ivory shadow-lg"
            >
              👆 اضغط <strong>السماح</strong> في نافذة المتصفح لتفعيل الميكروفون
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-ink-850" />
            </div>
          ) : null}
          {status === "recording" ? (
            <Button type="button" variant="danger" size="sm" onClick={stop} aria-label="إيقاف التسجيل">
              <Square className="size-3.5" fill="currentColor" />
              إيقاف
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={start}
              loading={status === "processing" || awaitingPermission}
              aria-label="تسجيل ملاحظة صوتية"
            >
              {status !== "processing" && !awaitingPermission ? <Mic className="size-3.5" /> : null}
              {awaitingPermission ? "بانتظار إذن الميكروفون…" : status === "processing" ? "جارٍ التفريغ الصوتي…" : "تسجيل ملاحظة صوتية"}
            </Button>
          )}
        </div>

        <div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
          {levels.map((level, i) => (
            <span
              key={i}
              className={cn("w-full rounded-full transition-[height] duration-75", status === "recording" ? "bg-ember-400" : "bg-line/10")}
              style={{ height: `${Math.round(level * 100)}%`, minHeight: 3 }}
            />
          ))}
        </div>

        {status === "recording" ? <span className="font-mono text-[12px] tabular-nums text-mist">{mm}:{ss}</span> : null}

        {status === "error" ? (
          <button type="button" onClick={discard} className="text-fog hover:text-ivory" aria-label="إغلاق">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      {status === "processing" ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-fog">
          <Loader2 className="size-3 animate-spin" /> جارٍ تفريغ ملاحظتك الصوتية (عربي أو إنجليزي)…
        </p>
      ) : null}
      {error ? <p className="mt-2.5 text-[12.5px] text-danger">{error}</p> : null}
      {status === "idle" && !error ? (
        <p className="mt-2.5 text-[12.5px] text-fog">تحدّث بدلاً من الكتابة — العربية والإنجليزية كلاهما يعملان. سنفرّغ الصوت مباشرة في الحقل أعلاه.</p>
      ) : null}
    </div>
  );
}
