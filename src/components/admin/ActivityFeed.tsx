import Link from "next/link";
import { describeEvent, eventTone } from "@/lib/activity";
import { formatRelative } from "@/lib/format";
import type { LeadEvent } from "@/lib/types";
import { cn } from "@/components/ui/cn";

const TONES = { good: "bg-success", warn: "bg-ember-400", bad: "bg-danger", info: "bg-info", neutral: "bg-fog/70" };

export function ActivityFeed({ events, leadNames = {}, compact = false }: { events: LeadEvent[]; leadNames?: Record<string, string>; compact?: boolean }) {
  if (!events.length) return <p className="py-6 text-center text-[14px] text-fog">No activity yet.</p>;
  return (
    <ol className="relative space-y-0.5">
      {events.map((event) => {
        const tone = eventTone(event.type);
        const name = event.leadId ? leadNames[event.leadId] : undefined;
        const body = (
          <div className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-line/[0.03]">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONES[tone])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug text-ivory/90">
                {name && !compact ? <span className="font-medium text-ivory">{name} · </span> : null}
                {describeEvent(event)}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fog">
                {formatRelative(event.createdAt)} · {event.actor.replace("admin:", "")}
              </p>
            </div>
          </div>
        );
        return <li key={event.id}>{event.leadId && !compact ? <Link href={`/admin/leads/${event.leadId}`}>{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
