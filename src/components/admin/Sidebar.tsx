"use client";

import { FileStack, LayoutDashboard, LogOut, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";
import { LiveIndicator } from "./LiveProvider";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/leads", label: "Leads", icon: Users },
  { href: "/admin/proposals", label: "Proposals", icon: FileStack },
  { href: "/admin/settings", label: "Settings", icon: Settings2 },
];

export function Sidebar({ email, reviewCount }: { email: string; reviewCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };
  return (
    <aside className="glass sticky top-0 z-30 flex flex-col gap-4 border-b border-line/[0.06] px-4 py-3 lg:h-screen lg:w-64 lg:shrink-0 lg:rounded-none lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
        <Logo href="/admin" subtitle="Studio OS" />
        <LiveIndicator />
      </div>
      <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto lg:mt-6 lg:flex-col">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors",
                active
                  ? "bg-white text-ivory shadow-[0_6px_18px_-12px_rgb(10_22_105/0.5)] ring-1 ring-inset ring-navy-400/15"
                  : "text-mist hover:bg-line/[0.04] hover:text-ivory",
              )}
            >
              <item.icon className={cn("size-[18px]", active ? "text-ember-300" : "")} strokeWidth={1.7} />
              {item.label}
              {item.href === "/admin/leads" && reviewCount > 0 ? (
                <span className="ml-auto rounded-full bg-ember-500/20 px-2 py-px font-mono text-[11px] text-ember-200">{reviewCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden border-t border-line/[0.06] pt-4 lg:block">
        <p className="truncate text-[12.5px] text-fog">{email}</p>
        <button onClick={logout} className="mt-2 inline-flex items-center gap-2 text-[13px] text-mist transition hover:text-ivory">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}
