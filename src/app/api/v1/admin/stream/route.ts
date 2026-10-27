import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { route } from "@/lib/http";
import { subscribeEvents } from "@/lib/realtime/bus";

/**
 * GET /api/v1/admin/stream — Server-Sent Events feed of the activity log.
 *
 * Works on single servers and serverless alike: events recorded by this
 * instance wake the loop instantly (in-process bus); events from other
 * instances (e.g. an n8n callback served elsewhere) arrive via a short poll of
 * the event table. The connection closes before the platform's max duration
 * and EventSource reconnects with `Last-Event-ID`, so nothing is missed.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 2500;
const HEARTBEAT_MS = 15_000;
const LIFETIME_MS = 270_000;

export const GET = route(async (request) => {
  await authorize(request, ["admin"]);
  const repo = getRepository();
  const url = new URL(request.url);
  const resumeFrom = Number(request.headers.get("last-event-id") ?? url.searchParams.get("since") ?? Number.NaN);
  let cursor = Number.isFinite(resumeFrom) ? resumeFrom : await repo.latestEventId();

  const encoder = new TextEncoder();
  let wake: (() => void) | null = null;
  let closed = false;
  const unsubscribe = subscribeEvents(() => wake?.());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const deadline = Date.now() + LIFETIME_MS;
      let lastWrite = Date.now();
      try {
        send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ cursor })}\n\n`);
        while (!closed && !request.signal.aborted && Date.now() < deadline) {
          const events = await repo.listEvents({ afterId: cursor, limit: 100, order: "asc" });
          for (const event of events) {
            cursor = event.id;
            send(`id: ${event.id}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
            lastWrite = Date.now();
          }
          if (Date.now() - lastWrite > HEARTBEAT_MS) {
            send(`: heartbeat\n\n`);
            lastWrite = Date.now();
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, POLL_MS);
            wake = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          wake = null;
        }
      } catch {
        // Client disconnected or the store failed; EventSource will reconnect.
      } finally {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      closed = true;
      unsubscribe();
      wake?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
