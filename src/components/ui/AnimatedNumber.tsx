"use client";

import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/** Smoothly tweens between numeric values (e.g. the live estimate). */
export function AnimatedNumber({ value, format, duration = 0.8 }: { value: number; format: (value: number) => string; duration?: number }) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [value, duration, reduce, motionValue]);

  return <span className="tabular-nums">{format(reduce ? value : display)}</span>;
}
