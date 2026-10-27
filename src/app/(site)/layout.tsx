import { Backdrop } from "@/components/ui/Backdrop";
import { ClickSound } from "@/components/ui/ClickSound";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Backdrop />
      <ClickSound />
      {children}
    </>
  );
}
