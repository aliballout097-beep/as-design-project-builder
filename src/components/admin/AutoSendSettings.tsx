"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";

interface Settings {
  autoSend: boolean;
  promoPercent: number;
  promoLabel: string;
}

/**
 * Settings → Automation. Auto-send (a freshly generated proposal is emailed to
 * the client immediately, or waits for manual "Approve & send") and the
 * promotion applied to every new proposal and to the builder's live estimate.
 */
export function AutoSendSettings() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({ autoSend: true, promoPercent: 25, promoLabel: "" });
  const [promoDraft, setPromoDraft] = useState({ percent: "25", label: "" });
  const [saving, setSaving] = useState<null | "autoSend" | "promo">(null);

  useEffect(() => {
    fetch("/api/v1/admin/settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json();
      })
      .then((body: Settings) => {
        setSettings(body);
        setPromoDraft({ percent: String(body.promoPercent ?? 0), label: body.promoLabel ?? "" });
      })
      .catch(() => toast.error("Couldn't load automation settings — please refresh."))
      .finally(() => setLoading(false));
  }, []);

  const save = async (patch: Partial<Settings>, which: "autoSend" | "promo") => {
    setSaving(which);
    try {
      const response = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Save failed");
      setSettings(body);
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setSaving(null);
    }
  };

  const toggleAutoSend = async (next: boolean) => {
    if (await save({ autoSend: next }, "autoSend")) {
      toast.success(next ? "Proposals will now be emailed to clients automatically." : "Proposals now wait for your manual approval.");
    }
  };

  const savePromo = async () => {
    const percent = Math.max(0, Math.min(90, Number(promoDraft.percent) || 0));
    if (await save({ promoPercent: percent, promoLabel: promoDraft.label.trim() || `Current offer — ${percent}% off` }, "promo")) {
      toast.success(percent > 0 ? `Promotion set to ${percent}% for new proposals and the live estimate.` : "Promotion turned off.");
    }
  };

  if (loading) return <p className="text-[13.5px] text-mist">Loading…</p>;

  return (
    <div className="space-y-6">
      <Switch
        id="auto-send"
        checked={settings.autoSend}
        onChange={toggleAutoSend}
        label={saving === "autoSend" ? "Saving…" : "Auto-send proposals"}
        description="Email the client their proposal PDF the moment it's ready — no manual step. Only a lead's first proposal is sent automatically; revisions wait for Approve & send."
      />
      <div className="border-t border-line/[0.07] pt-5">
        <p className="text-[14px] text-ivory">Promotion</p>
        <p className="mt-0.5 text-[12.5px] text-fog">
          Shown as a discount line on every new proposal and in the builder&apos;s live estimate (the $150 Startup Website stays at full price, like asdesignlb.com/pricing). Set 0 to turn it off.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor="promo-percent">Discount %</Label>
            <Input id="promo-percent" type="number" min={0} max={90} value={promoDraft.percent} onChange={(e) => setPromoDraft((d) => ({ ...d, percent: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="promo-label">Label on the proposal</Label>
            <Input id="promo-label" maxLength={80} placeholder="Current offer — 25% off" value={promoDraft.label} onChange={(e) => setPromoDraft((d) => ({ ...d, label: e.target.value }))} />
          </div>
          <Button variant="outline" loading={saving === "promo"} onClick={savePromo}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
