import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Small HTTP toolkit for route handlers: typed errors, JSON helpers, bounded
 * body parsing with zod validation, client IP extraction and CORS.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function jsonError(error: ApiError): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
    { status: error.status, headers: error.headers },
  );
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response>;

/** Wrap a route handler: converts thrown ApiError / ZodError into JSON responses. */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) return jsonError(error);
      if (error instanceof Error && error.name === "NotFoundError") {
        return jsonError(new ApiError(404, "not_found", error.message));
      }
      if (error instanceof z.ZodError) {
        return jsonError(new ApiError(422, "validation_failed", "Request validation failed", z.flattenError(error)));
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed`, error);
      return jsonError(new ApiError(500, "internal_error", "Something went wrong. Please try again."));
    }
  };
}

/** Read and validate a JSON body, refusing oversized payloads. */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  options: { maxBytes?: number } = {},
): Promise<z.output<S>> {
  const maxBytes = options.maxBytes ?? 256 * 1024;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large");

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body is too large");
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(422, "validation_failed", "Request validation failed", z.flattenError(result.error));
  }
  return result.data;
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return request.headers.get("x-real-ip") ?? request.headers.get("cf-connecting-ip") ?? null;
}

/** CORS headers for an allowed origin (or none when the origin is not allowed). */
export function corsHeaders(request: Request, allowedOrigins: string[], methods = "POST, OPTIONS"): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withHeaders(response: Response, headers: HeadersInit): Response {
  const target = new Headers(headers);
  target.forEach((value, name) => response.headers.set(name, value));
  return response;
}
