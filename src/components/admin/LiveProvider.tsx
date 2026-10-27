"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeEvent } from "@/lib/activity";
import type { LeadEvent } from "@/lib/types";

type ConnectionState = "connecting" | "live" | "offline";

const LiveContext = createContext<{ state: ConnectionState; lastEvent: LeadEvent | null }>({ state: "connecting", lastEvent: null });

export const useLive = () => useContext(LiveContext);

const TOAST_TYPES = new Set(["lead.created", "analysis.completed", "analysis.failed", "proposal.accepted", "proposal.declined", "proposal.viewed", "webhook.failed", "email.failed", "proposal.sent"]);

/**
 * Subscribes to /api/v1/admin/stream (SSE). On each activity event it refreshes
 * the server-rendered dashboard (debounced) and toasts the important ones.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ConnectionState>("connecting");
  const [lastEvent, setLastEvent] = useState<LeadEvent | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/v1/admin/stream");
    source.addEventListener("ready", () => setState("live"));
    source.addEventListener("activity", (message) => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as LeadEvent;
        setLastEvent(event);
        if (TOAST_TYPES.has(event.type)) {
          const text = describeEvent(event);
          if (event.type === "analysis.failed" || event.type === "webhook.failed" || event.type === "email.failed") toast.error(text);
          else toast(text, event.leadId ? { action: { label: "Open", onClick: () => router.push(`/admin/leads/${event.leadId}`) } } : undefined);
        }
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 400);
      } catch {
        // ignore malformed frames
      }
    });
    source.onerror = () => setState(source.readyState === EventSource.CLOSED ? "offline" : "connecting");
    source.onopen = () => setState("live");
    return () => {
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [router]);

  return <LiveContext.Provider value={{ state, lastEvent }}>{children}</LiveContext.Provider>;
}

export function LiveIndicator() {
  const { state } = useLive();
  const styles = {
    live: { dot: "bg-success shadow-[0_0_10px_rgb(110_231_168/0.8)] animate-pulse-soft", text: "Live" },
    connecting: { dot: "bg-warning", text: "Connecting" },
    offline: { dot: "bg-danger", text: "Offline" },
  }[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-line/[0.03] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-mist" role="status">
      <span className={`size-1.5 rounded-full ${styles.dot}`} />
      {styles.text}
    </span>
  );
}
