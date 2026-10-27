import type { Metadata } from "next";
import { ClickSound } from "@/components/ui/ClickSound";

export const metadata: Metadata = {
  title: "Project Builder",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClickSound />
      {children}
    </>
  );
}
