"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNTRIES, COUNTRY_MAP, DEFAULT_COUNTRY, type Country } from "@/config/countries";
import { cn } from "@/components/ui/cn";

/**
 * Phone number with a searchable country-code picker beside it ("لبنان +961").
 * Search matches the Arabic name, the English name or the code.
 */
export function PhoneField({
  id,
  country,
  national,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  country: string;
  national: string;
  onChange: (value: { country: string; national: string }) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected: Country = COUNTRY_MAP[country] ?? DEFAULT_COUNTRY;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.nameAr.includes(query.trim()) || c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.code.toLowerCase() === q);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: Country) => {
    onChange({ country: next.code, national });
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative" dir="ltr">
      <div
        className={cn(
          "flex h-12 items-stretch overflow-hidden rounded-xl border bg-white transition focus-within:border-ember-400/70 focus-within:ring-2 focus-within:ring-ember-400/20",
          invalid ? "border-danger/60" : "border-line/15",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`رمز الدولة: ${selected.nameAr} +${selected.dial}`}
          className="flex shrink-0 items-center gap-1.5 border-e border-line/10 bg-sky-100/60 px-3 text-[14px] font-semibold text-ivory transition hover:bg-sky-100"
        >
          <span className="text-[11px] font-bold tracking-wide text-fog">{selected.code}</span>
          <span>+{selected.dial}</span>
          <ChevronDown className={cn("size-3.5 text-fog transition-transform", open && "rotate-180")} />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="next"
          placeholder={selected.code === "LB" ? "03 123 456" : "…"}
          value={national}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange({ country: selected.code, national: e.target.value.replace(/[^0-9 ()\-.]/g, "").slice(0, 20) })}
          className="min-w-0 flex-1 bg-transparent px-3 text-[16px] text-ivory outline-none placeholder:text-fog/60"
        />
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-line/12 bg-white shadow-[0_24px_60px_-24px_rgb(10_22_105/0.45)]" dir="rtl">
          <label className="flex items-center gap-2 border-b border-line/[0.08] px-3">
            <Search className="size-4 shrink-0 text-fog" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن دولتك… (لبنان، 961)"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ivory outline-none placeholder:text-fog/70"
              aria-label="ابحث عن الدولة"
            />
          </label>
          <ul id={listId} role="listbox" aria-label="الدول" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {results.length ? (
              results.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.code === selected.code}
                    onClick={() => choose(c)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-[14.5px] transition hover:bg-sky-100/70",
                      c.code === selected.code ? "font-bold text-ember-300" : "text-ivory",
                    )}
                  >
                    <span>{c.nameAr}</span>
                    <span className="shrink-0 text-[13px] text-mist" dir="ltr">
                      +{c.dial}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-3 text-[13.5px] text-fog">لا توجد نتائج</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
