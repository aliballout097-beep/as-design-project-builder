import "server-only";
import OpenAI from "openai";
import { getConfig } from "@/lib/env";
import { ApiError, corsHeaders, getClientIp, jsonOk, route, withHeaders } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/v1/transcribe — voice intake for the Project Builder.
 *
 * Accepts a short audio recording (multipart/form-data, field "audio") and
 * transcribes it with OpenAI Whisper. Auto-detects language, so it handles
 * English and Arabic (Gulf/Lebanese) without the caller specifying which.
 * The returned text is meant to be dropped into the brief's free-text
 * description, so it flows into the same AI scope & budget analysis as
 * typed input — no separate pipeline.
 */

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper's hard limit
const ALLOWED_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/flac",
]);

// Biases Whisper's vocabulary/spelling toward the studio's own names and
// signals that the speaker may switch between English and Arabic dialects.
const TRANSCRIBE_PROMPT =
  "AS Design Studio, Ali Mawla, asdesignlb.com. The speaker is describing a web, brand or automation " +
  "project brief, in English or Arabic (Gulf or Lebanese dialect).";

interface WhisperVerboseResult {
  text: string;
  language?: string;
  duration?: number;
}

export const OPTIONS = route(async (request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, getConfig().allowedOrigins) });
});

export const POST = route(async (request) => {
  const cors = corsHeaders(request, getConfig().allowedOrigins);
  try {
    return await handleTranscribe(request, cors);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(error.status, error.code, error.message, error.details, { ...cors, ...(error.headers as Record<string, string>) });
    }
    throw error;
  }
});

async function handleTranscribe(request: Request, cors: HeadersInit): Promise<Response> {
  const config = getConfig();
  if (!config.ai.openai) {
    throw new ApiError(503, "transcription_unavailable", "Voice transcription is not configured (OPENAI_API_KEY missing).");
  }

  const ip = getClientIp(request);
  await enforceRateLimit(`transcribe:${ip ?? "unknown"}`, 10, 10 * 60 * 1000);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new ApiError(400, "invalid_request", 'Expected multipart/form-data with an "audio" field.');
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    throw new ApiError(400, "invalid_request", 'Missing "audio" file field.');
  }
  if (audio.size === 0) throw new ApiError(400, "invalid_request", "التسجيل فارغ.");
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new ApiError(413, "payload_too_large", "التسجيل طويل جداً (الحد الأقصى 25 ميغابايت، أي نحو 20–25 دقيقة).");
  }
  const mime = audio.type.split(";")[0]?.trim();
  if (mime && !ALLOWED_TYPES.has(mime)) {
    throw new ApiError(415, "unsupported_media_type", `Unsupported audio format: ${audio.type}`);
  }

  const client = new OpenAI({ apiKey: config.ai.openai.apiKey, maxRetries: 2, timeout: 55_000 });

  let result: WhisperVerboseResult;
  try {
    result = (await client.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      response_format: "verbose_json",
      prompt: TRANSCRIBE_PROMPT,
    })) as unknown as WhisperVerboseResult;
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new ApiError(502, "transcription_failed", `تعذّر التفريغ الصوتي: ${error.message}`);
    }
    throw error;
  }

  const text = result.text?.trim() ?? "";
  if (!text) throw new ApiError(422, "empty_transcript", "تعذّر تمييز أي كلام في هذا التسجيل — الرجاء المحاولة مجدداً.");

  return withHeaders(jsonOk({ text, language: result.language ?? null, duration: result.duration ?? null }), cors);
}
