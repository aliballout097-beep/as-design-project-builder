"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { LEAD_STATUS_LABELS } from "./StatusPill";

async function call(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export function LeadActions({ leadId, status, analyzing }: { leadId: string; status: LeadStatus; analyzing: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    try {
      const result = await call(`/api/v1/leads/${leadId}/analyze`, { method: "POST", body: JSON.stringify({ instructions: instructions || null }) });
      toast.success(result.runner === "n8n" ? "Sent to the n8n AI workflow — the new draft appears here automatically." : "Regenerating… the new draft appears here automatically.");
      setOpen(false);
      setInstructions("");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (next: LeadStatus) => {
    try {
      await call(`/api/v1/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      toast.success(`Status set to ${LEAD_STATUS_LABELS[next]}`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/leads/${leadId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      toast.success("Lead deleted");
      router.push("/admin/leads");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <select
        aria-label="Lead status"
        value={status}
        onChange={(e) => changeStatus(e.target.value as LeadStatus)}
        className="h-10 rounded-xl border border-line/10 bg-line/[0.04] px-3 text-[13.5px] text-ivory outline-none focus:border-ember-400/50"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-ink-900">
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={analyzing}>
        <RefreshCw className={analyzing ? "size-4 animate-spin" : "size-4"} /> {analyzing ? "Analysing…" : "Regenerate"}
      </Button>
      <Button variant="ghost" aria-label="Delete lead" onClick={() => setDeleteOpen(true)}>
        <Trash2 className="size-4" />
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Regenerate the scope analysis"
        description="A new analysis and proposal draft will be created. Open drafts are superseded; sent proposals stay untouched until you approve the new version."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={regenerate}>
              <RefreshCw className="size-4" /> Regenerate
            </Button>
          </>
        }
      >
        <label className="block text-[13px] text-mist">
          Direction for the AI (optional)
          <textarea
            rows={4}
            value={instructions}
            maxLength={2000}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Fit phase one within $12k and move e-commerce to a phase-two roadmap."
            className="mt-2 w-full rounded-xl border border-line/10 bg-line/[0.035] px-3.5 py-3 text-[14px] text-ivory outline-none placeholder:text-fog focus:border-ember-400/50"
          />
        </label>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this lead permanently?"
        description="The brief, analyses, proposals and activity are removed. Records already synced to your CRM are not affected. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Delete lead
            </Button>
          </>
        }
      />
    </>
  );
}

export function NotesEditor({ leadId, initial }: { leadId: string; initial: string | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = notes !== (initial ?? "");
  const save = async () => {
    setSaving(true);
    try {
      await call(`/api/v1/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ notes: notes || null }) });
      toast.success("Notes saved");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <textarea
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Internal notes — never shown to the client."
        className="w-full rounded-xl border border-line/10 bg-line/[0.03] px-3.5 py-3 text-[13.5px] text-ivory outline-none placeholder:text-fog focus:border-ember-400/50"
      />
      {dirty ? (
        <Button size="sm" className="mt-2" loading={saving} onClick={save}>
          Save notes
        </Button>
      ) : null}
    </div>
  );
}
