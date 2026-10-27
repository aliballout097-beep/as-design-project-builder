"use client";

import { ChevronDown, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

/**
 * Settings → Pricing. The studio's whole rate card, editable without code:
 * each service's price per plan (blank = plan not offered) and what each plan
 * includes, the fixed-price items (logo, stickers, reels, CV…), add-ons, how
 * much cheaper edits and redesigns are, and the first plan with the payment
 * gateway.
 *
 * Saved values apply at once to the builder's live price, every new proposal
 * and its plans, and the AI's rate card — in-app and in n8n (the app sends its
 * live prompt with every analysis request). Proposals already sent keep their
 * prices. Only values that differ from the shipped defaults are stored.
 */

type Tier = "starter" | "standard" | "advanced" | "enterprise";
type PerTier<T> = Record<Tier, T>;

interface PlanInfo {
  key: Tier;
  name: string;
  nameAr: string;
}
interface ServiceRow {
  key: string;
  name: string;
  nameAr: string;
  tiers: PerTier<number | null>;
  defaultTiers: PerTier<number | null>;
  promo: boolean;
  defaultPromo: boolean;
  /** Special discount % per plan (instead of the general promotion). */
  offers: PerTier<number | null>;
  defaultOffers: PerTier<number | null>;
  includes: PerTier<string[]>;
  defaultIncludes: PerTier<string[]>;
}
interface ItemRow {
  key: string;
  name: string;
  nameAr: string;
  unitAr: string;
  serviceAr: string;
  price: number;
  defaultPrice: number;
}
interface FeatureRow {
  key: string;
  name: string;
  nameAr: string;
  price: number;
  defaultPrice: number;
  monthly: number | null;
  defaultMonthly: number | null;
}
interface TypeRow {
  key: string;
  label: string;
  labelAr: string;
  factor: number;
  defaultFactor: number;
}
interface PricingPayload {
  plans: PlanInfo[];
  services: ServiceRow[];
  items: ItemRow[];
  features: FeatureRow[];
  typeFactors: TypeRow[];
  paymentsMinTier: Tier;
  defaultPaymentsMinTier: Tier;
}

const inputClass =
  "w-full rounded-lg border border-line/10 bg-white/70 px-2.5 py-2 text-[14px] text-ivory outline-none transition placeholder:text-fog/60 focus:border-ember-400/60";

function MoneyInput({
  value,
  onChange,
  placeholder,
  changed,
  label,
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  changed?: boolean;
  label: string;
  allowEmpty?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-fog">{label}</span>
      <span className="relative block" dir="ltr">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 grid place-items-center text-[13px] text-fog">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange(allowEmpty ? null : 0);
            else onChange(Math.max(0, Number(raw)));
          }}
          className={cn(inputClass, "pl-6", changed && "border-ember-400/50 bg-ember-400/[0.05]")}
        />
      </span>
    </label>
  );
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, i) => item === b[i]);
const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

/** Store only what differs from the shipped defaults. */
function toOverrides(data: PricingPayload) {
  const services: Record<string, unknown> = {};
  for (const s of data.services) {
    const tiers: Partial<PerTier<number | null>> = {};
    const offers: Partial<PerTier<number | null>> = {};
    const includes: Partial<PerTier<{ ar: string[] }>> = {};
    for (const plan of data.plans) {
      if (s.tiers[plan.key] !== s.defaultTiers[plan.key]) tiers[plan.key] = s.tiers[plan.key];
      if ((s.offers[plan.key] ?? null) !== (s.defaultOffers[plan.key] ?? null)) offers[plan.key] = s.offers[plan.key] || null;
      const bullets = lines(s.includes[plan.key].join("\n"));
      if (!sameList(bullets, s.defaultIncludes[plan.key]) && bullets.length) includes[plan.key] = { ar: bullets };
    }
    const entry = {
      ...(Object.keys(tiers).length ? { tiers } : {}),
      ...(Object.keys(offers).length ? { offers } : {}),
      ...(Object.keys(includes).length ? { includes } : {}),
      ...(s.promo !== s.defaultPromo ? { promo: s.promo } : {}),
    };
    if (Object.keys(entry).length) services[s.key] = entry;
  }
  return {
    services,
    items: Object.fromEntries(data.items.filter((i) => i.price !== i.defaultPrice).map((i) => [i.key, { price: i.price }])),
    features: Object.fromEntries(
      data.features
        .filter((f) => f.price !== f.defaultPrice || f.monthly !== f.defaultMonthly)
        .map((f) => [f.key, { price: f.price, ...(f.monthly !== null ? { monthly: f.monthly } : {}) }]),
    ),
    typeFactors: Object.fromEntries(data.typeFactors.filter((t) => t.factor !== t.defaultFactor).map((t) => [t.key, t.factor])),
    ...(data.paymentsMinTier !== data.defaultPaymentsMinTier ? { paymentsMinTier: data.paymentsMinTier } : {}),
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-fog">{title}</p>
        {hint ? <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PricingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [data, setData] = useState<PricingPayload | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    fetch("/api/v1/admin/pricing")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load pricing");
        return res.json();
      })
      .then((body: PricingPayload) => {
        setData(body);
        setSaved(JSON.stringify(toOverrides(body)));
      })
      .catch(() => toast.error("Couldn't load pricing — please refresh."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const overrides = useMemo(() => (data ? toOverrides(data) : null), [data]);
  const dirty = overrides !== null && JSON.stringify(overrides) !== saved;

  const patch = <K extends "services" | "items" | "features" | "typeFactors">(key: K, rowKey: string, change: Partial<PricingPayload[K][number]>) =>
    setData((current) =>
      current ? { ...current, [key]: (current[key] as { key: string }[]).map((row) => (row.key === rowKey ? { ...row, ...change } : row)) } : current,
    );

  const persist = async (body: unknown, success: string) => {
    const response = await fetch("/api/v1/admin/pricing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error?.message ?? "Save failed");
    toast.success(success);
    load();
  };

  const save = async () => {
    if (!overrides) return;
    const invalid = data?.services.find((s) => data.plans.every((plan) => s.tiers[plan.key] === null));
    if (invalid) {
      toast.error(`${invalid.name}: keep at least one plan price.`);
      return;
    }
    setSaving(true);
    try {
      await persist(overrides, "Prices saved — the builder, new proposals and the AI use them now.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!window.confirm("Reset every price and plan description to the shipped defaults?")) return;
    setResetting(true);
    try {
      await persist({ services: {}, features: {}, items: {}, typeFactors: {} }, "Back to the default rate card.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResetting(false);
    }
  };

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 text-[13.5px] text-mist">
        <Loader2 className="size-4 animate-spin" /> Loading current rates…
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3 rounded-2xl border border-ember-400/25 bg-ember-400/[0.06] p-4 text-[13px] leading-relaxed text-mist">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-ember-300" />
        <p>
          The AI never invents prices: every proposal is priced from this page. Change a number, press <strong className="text-ivory">Save</strong>, and the
          next brief (in the app or in n8n) is priced and described with it. Proposals already sent keep their prices.
        </p>
      </div>

      <Section title="Services · price per plan" hint="Leave a plan empty if you don't offer it for that service. “Special offer” puts a plan on sale (e.g. $300 at 50% = $150, shown to clients with the old price struck through); empty = the general promotion from Settings → Automation. Tap a service to edit what each plan includes (Arabic, one line per point — clients see it and the AI reads it).">
        <div className="space-y-2.5">
          {data.services.map((service) => {
            const expanded = open === service.key;
            return (
              <div key={service.key} className="rounded-2xl border border-line/[0.08] bg-white/60 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setOpen(expanded ? null : service.key)} className="flex min-w-0 items-center gap-2 text-start" aria-expanded={expanded}>
                    <ChevronDown className={cn("size-4 shrink-0 text-fog transition-transform", expanded && "rotate-180")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ivory">{service.name}</span>
                      <span className="block truncate text-left text-[12px] text-fog" dir="rtl">
                        {service.nameAr}
                      </span>
                    </span>
                  </button>
                  <label className="flex items-center gap-2 text-[12px] text-mist">
                    <input type="checkbox" checked={service.promo} onChange={(e) => patch("services", service.key, { promo: e.target.checked })} className="size-4 accent-[var(--color-ember-400)]" />
                    Promotion applies
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {data.plans.map((plan) => {
                    const price = service.tiers[plan.key];
                    const offer = service.offers[plan.key];
                    return (
                      <div key={plan.key}>
                        <MoneyInput
                          label={plan.name}
                          allowEmpty
                          placeholder="—"
                          value={price}
                          changed={price !== service.defaultTiers[plan.key]}
                          onChange={(value) => patch("services", service.key, { tiers: { ...service.tiers, [plan.key]: value } })}
                        />
                        {price !== null ? (
                          <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fog">
                            <span className="shrink-0">Special offer</span>
                            <span className="relative w-16" dir="ltr">
                              <input
                                type="number"
                                min={0}
                                max={95}
                                step={5}
                                value={offer ?? ""}
                                placeholder={service.promo ? "promo" : "—"}
                                onChange={(e) =>
                                  patch("services", service.key, {
                                    offers: { ...service.offers, [plan.key]: e.target.value === "" ? null : Math.min(95, Math.max(0, Number(e.target.value))) },
                                  })
                                }
                                className={cn(
                                  "w-full rounded-md border border-line/10 bg-white/70 py-1 pl-1.5 pr-5 text-[12px] text-ivory outline-none focus:border-ember-400/60",
                                  (offer ?? null) !== (service.defaultOffers[plan.key] ?? null) && "border-ember-400/50",
                                )}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-1.5 grid place-items-center">%</span>
                            </span>
                            {offer ? (
                              <span className="font-semibold text-success" dir="ltr">
                                → ${Math.round(price * (1 - offer / 100))}
                              </span>
                            ) : null}
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {expanded ? (
                  <div className="mt-4 grid gap-3 border-t border-line/[0.07] pt-4 sm:grid-cols-2">
                    {data.plans
                      .filter((plan) => service.tiers[plan.key] !== null)
                      .map((plan) => (
                        <label key={plan.key} className="block">
                          <span className="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-fog">
                            <span>
                              {plan.name} · <span dir="rtl">{plan.nameAr}</span>
                            </span>
                            {!sameList(service.includes[plan.key], service.defaultIncludes[plan.key]) ? (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-ember-300 hover:underline"
                                onClick={() => patch("services", service.key, { includes: { ...service.includes, [plan.key]: service.defaultIncludes[plan.key] } })}
                              >
                                Default
                              </button>
                            ) : null}
                          </span>
                          <textarea
                            dir="rtl"
                            rows={5}
                            value={service.includes[plan.key].join("\n")}
                            onChange={(e) => patch("services", service.key, { includes: { ...service.includes, [plan.key]: e.target.value.split("\n").slice(0, 12) } })}
                            onBlur={(e) => patch("services", service.key, { includes: { ...service.includes, [plan.key]: lines(e.target.value) } })}
                            placeholder="نقطة في كل سطر…"
                            className={cn(inputClass, "resize-y leading-relaxed")}
                          />
                        </label>
                      ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Fixed-price items" hint="Sold per unit with a quantity — the client picks how many (e.g. 10 stickers = 10 × price).">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {data.items.map((item) => (
            <div key={item.key} className="flex items-end gap-3 rounded-2xl border border-line/[0.08] bg-white/60 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ivory">{item.name}</span>
                <span className="block truncate text-left text-[12px] text-fog" dir="rtl">
                  {item.nameAr} · {item.serviceAr}
                </span>
              </span>
              <span className="w-28 shrink-0">
                <MoneyInput label={`Price ${item.unitAr}`} value={item.price} changed={item.price !== item.defaultPrice} onChange={(value) => patch("items", item.key, { price: value ?? 0 })} />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Add-ons" hint="Extra features added on top of a plan.">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {data.features.map((feature) => (
            <div key={feature.key} className="flex items-end gap-3 rounded-2xl border border-line/[0.08] bg-white/60 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ivory">{feature.name}</span>
                <span className="block truncate text-left text-[12px] text-fog" dir="rtl">
                  {feature.nameAr}
                </span>
              </span>
              <span className="w-24 shrink-0">
                <MoneyInput label="One-time" value={feature.price} changed={feature.price !== feature.defaultPrice} onChange={(value) => patch("features", feature.key, { price: value ?? 0 })} />
              </span>
              {feature.defaultMonthly !== null ? (
                <span className="w-24 shrink-0">
                  <MoneyInput label="Monthly" value={feature.monthly} changed={feature.monthly !== feature.defaultMonthly} onChange={(value) => patch("features", feature.key, { monthly: value ?? 0 })} />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Rules">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {data.typeFactors.map((type) => (
            <label key={type.key} className="flex items-center gap-3 rounded-2xl border border-line/[0.08] bg-white/60 p-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-ivory">{type.label}</span>
                <span className="block text-[12px] text-fog">% of the new-work price {type.key === "new" ? "(normally 100%)" : ""}</span>
              </span>
              <span className="relative w-24 shrink-0" dir="ltr">
                <input
                  type="number"
                  min={5}
                  max={300}
                  step={5}
                  value={Math.round(type.factor * 100)}
                  onChange={(e) => patch("typeFactors", type.key, { factor: Math.min(3, Math.max(0.05, (Number(e.target.value) || 0) / 100)) })}
                  className={cn(inputClass, "pr-7", type.factor !== type.defaultFactor && "border-ember-400/50 bg-ember-400/[0.05]")}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-[13px] text-fog">%</span>
              </span>
            </label>
          ))}
          <label className="flex items-center gap-3 rounded-2xl border border-line/[0.08] bg-white/60 p-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ivory">Online payment gateway from</span>
              <span className="block text-[12px] text-fog">Lower plans use cash on delivery.</span>
            </span>
            <select
              value={data.paymentsMinTier}
              onChange={(e) => setData({ ...data, paymentsMinTier: e.target.value as Tier })}
              className={cn(inputClass, "w-40 shrink-0", data.paymentsMinTier !== data.defaultPaymentsMinTier && "border-ember-400/50")}
            >
              {data.plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name} plan
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line/10 bg-white/90 p-3 shadow-[0_18px_40px_-24px_rgb(10_22_105/0.5)] backdrop-blur">
        {dirty ? <span className="me-auto text-[12.5px] font-semibold text-ember-300">Unsaved changes</span> : <span className="me-auto text-[12.5px] text-fog">All changes saved</span>}
        <Button variant="ghost" size="sm" onClick={resetToDefaults} loading={resetting}>
          <RotateCcw className="size-3.5" /> Reset to defaults
        </Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
          <Save className="size-3.5" /> Save prices
        </Button>
      </div>
    </div>
  );
}
