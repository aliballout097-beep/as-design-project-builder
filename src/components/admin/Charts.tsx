"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

/**
 * Leads per day — single series, so one hue (ember) and no legend; the card
 * title names it. Bars have 4px rounded tops anchored to the baseline, a 2px
 * gap, and a hover tooltip with a hit target taller than the mark.
 */
export function DailyLeadsChart({ data }: { data: { date: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const height = 120;
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <figure>
      <div className="relative" role="img" aria-label={`Leads per day over the last ${data.length} days: ${total} total`}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line/[0.07]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 border-t border-line/10" aria-hidden />
        <div className="flex items-end gap-[2px]" style={{ height }}>
          {data.map((point, index) => {
            const h = point.count === 0 ? 2 : Math.max(6, (point.count / max) * (height - 8));
            return (
              <div
                key={point.date}
                className="relative flex h-full flex-1 cursor-default items-end"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`w-full rounded-t-[4px] transition-colors ${point.count === 0 ? "bg-line/[0.07]" : hover === index ? "bg-ember-300" : "bg-ember-500/80"}`}
                  style={{ height: h }}
                />
                {hover === index ? (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line/10 bg-ink-850 px-2.5 py-1.5 text-[12px] shadow-xl">
                    <span className="text-mist">{formatDate(point.date, { year: undefined })}</span>
                    <span className="ml-2 font-mono text-ivory">{point.count}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10.5px] text-fog">
        <span>{formatDate(data[0]?.date, { year: undefined })}</span>
        <span>max {max}/day</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Leads per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Pipeline by stage — one measure across ordered stages, so a single-hue bar list with labels. */
export function StageBars({ rows }: { rows: { label: string; value: number; href: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label}>
          <a href={row.href} className="group grid grid-cols-[110px_1fr_36px] items-center gap-3 rounded-lg py-0.5">
            <span className="truncate text-[13px] text-mist group-hover:text-ivory">{row.label}</span>
            <span className="h-2 rounded-full bg-line/[0.05]">
              <span className="block h-full rounded-full bg-ember-400/85 transition-colors group-hover:bg-ember-300" style={{ width: `${Math.max(row.value ? 4 : 0, (row.value / max) * 100)}%` }} />
            </span>
            <span className="text-right font-mono text-[12.5px] text-ivory">{row.value}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
