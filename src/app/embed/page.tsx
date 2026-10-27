import { ProjectBuilder } from "@/components/builder/ProjectBuilder";
import { Backdrop } from "@/components/ui/Backdrop";
import { cn } from "@/components/ui/cn";

/**
 * /embed — the Project Builder without site chrome, designed to live in an
 * iframe on asdesignlb.com (see public/widget.js). Query params:
 *   bg=transparent   let the host page show through (default: studio backdrop)
 *   origin, ref, page, utm_*  — forwarded by the loader for attribution & postMessage
 */
export default async function EmbedPage({ searchParams }: PageProps<"/embed">) {
  const params = await searchParams;
  const transparent = params.bg === "transparent";
  return (
    <main className={cn("min-h-screen", transparent && "[&_.glass]:bg-ink-900/70")}>
      {transparent ? null : <Backdrop intensity="soft" />}
      <ProjectBuilder variant="embed" />
    </main>
  );
}
