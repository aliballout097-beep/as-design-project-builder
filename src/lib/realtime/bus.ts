import "server-only";
import { EventEmitter } from "node:events";
import type { LeadEvent } from "@/lib/types";

/**
 * In-process pub/sub used to wake the dashboard's live stream instantly when an
 * event is recorded by this server instance. Cross-instance delivery is covered
 * by the stream's short polling loop over the `lead_events` table.
 */

const BUS_KEY = Symbol.for("asd.realtime.bus");
type GlobalWithBus = typeof globalThis & { [BUS_KEY]?: EventEmitter };

function bus(): EventEmitter {
  const g = globalThis as GlobalWithBus;
  if (!g[BUS_KEY]) {
    g[BUS_KEY] = new EventEmitter();
    g[BUS_KEY].setMaxListeners(1000);
  }
  return g[BUS_KEY];
}

export function publishEvent(event: LeadEvent): void {
  bus().emit("event", event);
}

export function subscribeEvents(listener: (event: LeadEvent) => void): () => void {
  bus().on("event", listener);
  return () => bus().off("event", listener);
}
