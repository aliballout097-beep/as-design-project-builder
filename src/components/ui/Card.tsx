import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass edge-light rounded-3xl", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-mono text-[10.5px] uppercase tracking-[0.28em] text-ember-300", className)} {...props} />;
}
