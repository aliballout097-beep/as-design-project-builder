"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function Chip({
  selected,
  onToggle,
  children,
  icon,
  disabled,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] transition-all duration-300 ease-out-expo active:scale-[0.97] disabled:opacity-40",
        selected
          ? "border-ember-400/70 bg-ember-400/10 text-ivory shadow-[0_6px_18px_-10px_rgb(210_102_10/0.6)]"
          : "border-line/12 bg-white text-mist hover:border-line/25 hover:text-ivory",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-4 place-items-center rounded-full border transition-all",
          selected ? "border-ember-400 bg-ember-400 text-white" : "border-line/25",
        )}
      >
        {selected ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {icon}
      {children}
    </button>
  );
}
