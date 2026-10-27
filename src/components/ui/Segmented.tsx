"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "./cn";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { key: T; label: string; description?: string }[];
  className?: string;
  ariaLabel: string;
}) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("grid gap-1.5 rounded-2xl border border-line/10 bg-sky-100/70 p-1.5 sm:auto-cols-fr sm:grid-flow-col", className)}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.key)}
            className={cn("relative rounded-xl px-4 py-3 text-start transition-colors", active ? "text-ivory" : "text-mist hover:text-ivory")}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl border border-navy-400/25 bg-white shadow-[0_6px_18px_-10px_rgb(10_22_105/0.45)]"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <span className="relative block text-[14px] font-medium">{option.label}</span>
            {option.description ? <span className="relative mt-0.5 block text-[12px] text-fog">{option.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
