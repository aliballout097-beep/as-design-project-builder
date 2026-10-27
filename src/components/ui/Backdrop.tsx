import { cn } from "./cn";

/**
 * Atmosphere layer: the sky-blue gradient behind the AM logo (AM.jpeg), with two
 * slow, soft light glows and a faint grid. Pure CSS (server component); motion is
 * disabled for reduced-motion users and the glows are dropped on small screens,
 * where large blurred layers cost battery for little visual gain.
 */
export function Backdrop({ className, intensity = "full" }: { className?: string; intensity?: "full" | "soft" }) {
  return (
    <div aria-hidden className={cn("automation-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)} style={{ background: "var(--sky-gradient)" }}>
      <div
        className="absolute -left-[20%] -top-[25%] hidden h-[75vh] w-[75vw] animate-drift-a rounded-full opacity-70 blur-[110px] md:block"
        style={{ background: "radial-gradient(closest-side, rgb(255 255 255 / 0.85), rgb(255 255 255 / 0.2) 60%, transparent)" }}
      />
      {intensity === "full" ? (
        <div
          className="absolute -bottom-[30%] -right-[15%] hidden h-[80vh] w-[70vw] animate-drift-b rounded-full opacity-40 blur-[130px] md:block"
          style={{ background: "radial-gradient(closest-side, rgb(210 102 10 / 0.35), rgb(210 102 10 / 0.06) 60%, transparent)" }}
        />
      ) : null}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255 / 0.6) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.6) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage: "radial-gradient(ellipse at 50% 25%, black 15%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 25%, black 15%, transparent 70%)",
        }}
      />
    </div>
  );
}
