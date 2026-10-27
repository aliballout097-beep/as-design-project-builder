-- Admin-editable app settings (Settings → Automation), e.g. auto-send. A
-- single JSON row, same pattern as pricing_overrides. See src/lib/settings.ts.

create table if not exists public.app_settings (
  id smallint primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at before update on public.app_settings
  for each row execute function public.asd_touch_updated_at();

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
