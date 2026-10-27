"use client";

import { Check, Copy, Database, FileText, Mail, MessageCircle, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

export function CopyBlock({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — select the text manually.");
    }
  };
  return (
    <div className="group relative">
      {label ? <p className="mb-1.5 text-[12px] text-fog">{label}</p> : null}
      <pre className="overflow-x-auto rounded-xl border border-line/[0.08] bg-sky-100/60 p-3.5 pr-12 font-mono text-[12px] leading-relaxed text-ivory/85">{value}</pre>
      <button onClick={copy} aria-label="Copy" className="absolute bottom-2.5 right-2.5 rounded-lg border border-line/10 bg-ink-850 p-1.5 text-mist transition hover:text-ivory">
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function TestWebhookButton({ target, disabled }: { target: "leadIntake" | "analysis" | "dispatch" | "crmSync"; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ...(target === "leadIntake" && email.trim() ? { email: email.trim() } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) toast.error(body?.error?.message ?? "Delivery failed");
      else if (body.ok) toast.success(email.trim() ? `Test lead sent — check ${email.trim()} and the admin inbox` : `n8n answered ${body.status} in ${body.durationMs} ms`);
      else toast.error(body.error ?? "Delivery failed");
    } catch {
      toast.error("Request failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {target === "leadIntake" ? (
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={disabled}
          className="w-44 rounded-lg border border-line/10 bg-line/[0.03] px-2.5 py-1.5 text-[13px] text-ivory outline-none transition placeholder:text-fog focus:border-ember-400/60 disabled:opacity-50"
        />
      ) : null}
      <Button size="sm" variant="outline" disabled={disabled} loading={busy} onClick={run}>
        <PlugZap className="size-3.5" /> {target === "leadIntake" && email.trim() ? "Send test lead" : "Test"}
      </Button>
    </div>
  );
}

export function SeedDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/demo-seed", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Failed");
      toast.success(`Loaded ${body.created} demo leads`);
      router.push("/admin");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={run}>
      <Database className="size-3.5" /> Load demo leads
    </Button>
  );
}

export function TestEmailButton({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState<null | "lead" | "proposal">(null);
  const [to, setTo] = useState("");
  const run = async (kind: "lead" | "proposal") => {
    setBusy(kind);
    try {
      const response = await fetch("/api/v1/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(kind === "proposal" && to.trim() ? { to: to.trim() } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Sending failed");
      toast.success(`Sent to ${body.to.join(", ")} — check the inbox (and that it is not in spam).`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={disabled} loading={busy === "lead"} onClick={() => run("lead")}>
        <Mail className="size-3.5" /> Test lead alert
      </Button>
      <input
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="client test address (optional)"
        disabled={disabled}
        className="w-56 rounded-lg border border-line/10 bg-white px-2.5 py-1.5 text-[13px] text-ivory outline-none transition placeholder:text-fog focus:border-ember-400/60 disabled:opacity-50"
      />
      <Button size="sm" variant="outline" disabled={disabled} loading={busy === "proposal"} onClick={() => run("proposal")}>
        <FileText className="size-3.5" /> Test proposal email + PDF
      </Button>
    </div>
  );
}

export function TestWhatsAppButton({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Sending failed");
      toast.success(`WhatsApp sent to +${body.to} — check the phone.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="tel"
        dir="ltr"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="+961 3 123 456"
        disabled={disabled}
        className="w-48 rounded-lg border border-line/10 bg-white px-2.5 py-1.5 text-[13px] text-ivory outline-none transition placeholder:text-fog focus:border-ember-400/60 disabled:opacity-50"
      />
      <Button size="sm" variant="outline" disabled={disabled || to.trim().length < 6} loading={busy} onClick={run}>
        <MessageCircle className="size-3.5" /> Send test WhatsApp
      </Button>
    </div>
  );
}
