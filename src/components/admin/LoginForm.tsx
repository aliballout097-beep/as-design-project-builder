"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Field";

export function LoginForm({ next, devLogin }: { next: string; devLogin: { email: string; password: string } | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(devLogin?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message ?? "Sign-in failed");
        return;
      }
      router.push(next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <FieldError message={error} />
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Sign in <ArrowRight className="size-4" />
      </Button>
      {devLogin ? (
        <p className="rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-warning">
          Development mode — no admin is configured. Sign in with <span className="font-mono">{devLogin.email}</span> /{" "}
          <span className="font-mono">{devLogin.password}</span>. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH before deploying.
        </p>
      ) : null}
    </form>
  );
}
