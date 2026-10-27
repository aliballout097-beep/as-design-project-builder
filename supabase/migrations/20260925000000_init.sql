-- AS Design Studio — Automation Suite schema
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
--
-- Security model: RLS is ENABLED on every table with NO policies for anon /
-- authenticated roles. Only the server (service-role key) reads or writes, so
-- a leaked anon key exposes nothing.

-- gen_random_uuid() is built into Postgres 13+ (Supabase), no extension required.

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  status           text not null default 'new'
                   check (status in ('new','analyzing','review','approved','sent','won','lost','archived')),
  source           text not null default 'builder'
                   check (source in ('builder','embed','api','n8n','import')),
  contact          jsonb not null,
  project          jsonb not null,
  plan             jsonb not null,
  estimate         jsonb not null,
  meta             jsonb not null default '{}'::jsonb,
  crm              jsonb not null default '{}'::jsonb,
  tags             text[] not null default '{}',
  notes            text,
  fit_score        integer check (fit_score between 0 and 100),
  estimated_value  numeric(12,2),
  analysis_error   text,
  services         text[] not null default '{}',
  budget           text,
  -- Generated columns keep search & reporting fast without duplicating writes.
  contact_name     text generated always as (contact->>'name') stored,
  contact_email    text generated always as (lower(contact->>'email')) stored,
  company          text generated always as (contact->>'company') stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (contact_email);
create index if not exists leads_services_idx on public.leads using gin (services);

-- ---------------------------------------------------------------------------
-- AI scope analyses (versioned per lead)
-- ---------------------------------------------------------------------------
create table if not exists public.analyses (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads (id) on delete cascade,
  version         integer not null,
  provider        text not null check (provider in ('anthropic','openai','heuristic')),
  model           text,
  runner          text not null check (runner in ('app','n8n')),
  result          jsonb not null,
  usage           jsonb,
  instructions    text,
  fallback_reason text,
  duration_ms     integer,
  created_at      timestamptz not null default now(),
  unique (lead_id, version)
);

-- ---------------------------------------------------------------------------
-- Proposals (versioned per lead; share_token grants client portal access)
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references public.leads (id) on delete cascade,
  analysis_id       uuid references public.analyses (id) on delete set null,
  version           integer not null,
  status            text not null default 'draft'
                    check (status in ('draft','approved','sent','accepted','declined','superseded')),
  title             text not null,
  executive_summary text not null default '',
  approach          text not null default '',
  line_items        jsonb not null default '[]'::jsonb,
  phases            jsonb not null default '[]'::jsonb,
  currency          char(3) not null default 'USD',
  discount          jsonb,
  tax_rate          numeric(5,2) not null default 0,
  payment_schedule  jsonb not null default '[]'::jsonb,
  assumptions       jsonb not null default '[]'::jsonb,
  next_steps        jsonb not null default '[]'::jsonb,
  notes             text,
  totals            jsonb not null,
  total             numeric(12,2) generated always as ((totals->>'total')::numeric) stored,
  valid_until       date not null,
  share_token       text not null unique,
  approved_at       timestamptz,
  approved_by       text,
  sent_at           timestamptz,
  viewed_at         timestamptz,
  responded_at      timestamptz,
  client_response   jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (lead_id, version)
);

create index if not exists proposals_lead_idx on public.proposals (lead_id, version desc);
create index if not exists proposals_status_idx on public.proposals (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Activity log — also the cursor for the dashboard's live stream
-- ---------------------------------------------------------------------------
create table if not exists public.lead_events (
  id          bigint generated always as identity primary key,
  lead_id     uuid references public.leads (id) on delete cascade,
  proposal_id uuid references public.proposals (id) on delete set null,
  type        text not null,
  actor       text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists lead_events_lead_idx on public.lead_events (lead_id, id desc);

-- ---------------------------------------------------------------------------
-- Idempotency keys for webhook callbacks (n8n retries safely)
-- ---------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  key          text primary key,
  scope        text not null,
  response     jsonb,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Optional CRM table — target of the n8n "05 · CRM Sync" Supabase branch
-- (use it when your CRM lives in a separate Supabase project, or for BI tools)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_contacts (
  id              bigint generated always as identity primary key,
  lead_reference  text not null unique,
  lead_id         uuid,
  name            text not null,
  email           text not null,
  phone           text,
  company         text,
  status          text,
  services        text[] not null default '{}',
  budget          text,
  timeline        text,
  source          text,
  fit_score       integer,
  estimated_value numeric(12,2),
  proposal_status text,
  proposal_total  numeric(12,2),
  dashboard_url   text,
  proposal_url    text,
  last_event      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.asd_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.asd_touch_updated_at();

drop trigger if exists proposals_touch on public.proposals;
create trigger proposals_touch before update on public.proposals
  for each row execute function public.asd_touch_updated_at();

-- Every recorded event bumps the lead's last activity timestamp.
create or replace function public.asd_bump_lead_activity() returns trigger
language plpgsql as $$
begin
  if new.lead_id is not null then
    update public.leads set last_activity_at = new.created_at where id = new.lead_id;
  end if;
  return new;
end $$;

drop trigger if exists lead_events_activity on public.lead_events;
create trigger lead_events_activity after insert on public.lead_events
  for each row execute function public.asd_bump_lead_activity();

-- ---------------------------------------------------------------------------
-- Row Level Security: deny-by-default for everyone except the service role.
-- ---------------------------------------------------------------------------
alter table public.leads            enable row level security;
alter table public.analyses         enable row level security;
alter table public.proposals        enable row level security;
alter table public.lead_events      enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.crm_contacts     enable row level security;

revoke all on public.leads, public.analyses, public.proposals, public.lead_events, public.idempotency_keys, public.crm_contacts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for archived proposal PDFs (n8n workflow 03, optional)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('proposals', 'proposals', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Housekeeping: purge idempotency keys older than 7 days (enable pg_cron to schedule)
--   select cron.schedule('asd-idempotency-cleanup', '17 3 * * *',
--     $$delete from public.idempotency_keys where created_at < now() - interval '7 days'$$);
-- ---------------------------------------------------------------------------
