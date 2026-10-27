import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "./cn";

/** The AM logo mark (navy "A", orange "M"). Transparent — sits on the sky canvas or a white card. */
export function Monogram({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small fixed-size brand mark, not worth next/image's overhead
    <img src={brand.logoPath} alt="AM" width={512} height={284} className={cn("h-7 w-auto shrink-0 select-none", className)} draggable={false} />
  );
}

/** Logo lockup: AM mark + the "ALI MAWLA" wordmark, as in AM.jpeg. */
export function Logo({ href = "/", className, subtitle }: { href?: string; className?: string; subtitle?: string }) {
  return (
    <Link href={href} dir="ltr" className={cn("group inline-flex items-center gap-2.5", className)} aria-label={`${brand.wordmark} — ${brand.name}`}>
      <span className="automation-logo-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size local studio logo */}
        <img src="/brand/asdesign-logo-v2.png" alt="Ali Mawla logo" width={1016} height={779} draggable={false} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="automation-wordmark">AS DESIGN <span>LB</span></span>
        {subtitle ? <span className="mt-1 text-[11px] text-fog">{subtitle}</span> : null}
      </span>
    </Link>
  );
}
