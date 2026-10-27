import Link from "next/link";
import { Backdrop } from "@/components/ui/Backdrop";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <Backdrop intensity="soft" />
      <div>
        <Logo className="justify-center" />
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.3em] text-ember-300">404</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-ivory sm:text-5xl">This page isn&apos;t part of the blueprint.</h1>
        <p className="mx-auto mt-3 max-w-md text-mist">The link may have expired or been replaced by a newer version.</p>
        <Link href="/" className="mt-8 inline-block rounded-xl border border-line/15 px-5 py-3 text-[14px] text-ivory transition hover:bg-line/[0.06]">
          Start a new project brief
        </Link>
      </div>
    </main>
  );
}
