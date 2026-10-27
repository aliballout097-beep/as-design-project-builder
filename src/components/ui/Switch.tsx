"use client";

import { cn } from "./cn";

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[14px] text-ivory">{label}</span>
        {description ? <span className="mt-0.5 block text-[12.5px] text-fog">{description}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300",
          checked ? "border-ember-400 bg-ember-400" : "border-line/15 bg-line/[0.1]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(10_22_105/0.35)] transition-all duration-300 ease-spring",
            checked ? "start-[22px]" : "start-0.5",
          )}
        />
      </button>
    </label>
  );
}
