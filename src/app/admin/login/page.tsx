import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/env";
import { LoginForm } from "@/components/admin/LoginForm";
import { Backdrop } from "@/components/ui/Backdrop";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" ? next : "/admin";
  if (await getAdminSession()) redirect(target.startsWith("/admin") ? target : "/admin");
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <Backdrop intensity="soft" />
      <div className="w-full max-w-md">
        <Logo href="/" subtitle="Studio OS" />
        <div className="glass edge-light mt-8 rounded-[28px] p-7 sm:p-9">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-ember-300">Agency dashboard</p>
          <h1 className="mt-3 font-display text-[34px] leading-tight tracking-tight text-ivory">Welcome back.</h1>
          <p className="mb-7 mt-2 text-[14.5px] text-mist">Leads, AI scope analyses and proposals — all in one place.</p>
          <LoginForm next={target} devLogin={getConfig().devLogin} />
        </div>
      </div>
    </main>
  );
}
