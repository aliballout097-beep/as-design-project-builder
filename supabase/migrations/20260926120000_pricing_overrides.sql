-- Admin-editable price overrides (Settings → Pricing). A single JSON row —
-- catalog.ts stays the shipped default rate card; this layer overrides the
-- numbers actually served to clients (live builder estimate, new proposals,
-- the AI system prompt) without a redeploy. See src/lib/pricing/overrides.ts.

create table if not exists public.pricing_overrides (
  id smallint primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pricing_overrides_singleton check (id = 1)
);

drop trigger if exists pricing_overrides_touch_updated_at on public.pricing_overrides;
create trigger pricing_overrides_touch_updated_at before update on public.pricing_overrides
  for each row execute function public.asd_touch_updated_at();

alter table public.pricing_overrides enable row level security;
revoke all on public.pricing_overrides from anon, authenticated;
