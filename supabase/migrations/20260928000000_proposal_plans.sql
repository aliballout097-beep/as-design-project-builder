-- Plans offered in each proposal (e.g. Essential / Professional / Advanced), each
-- priced from the published packages; the client picks one on the proposal page
-- (their choice is stored in client_response.plan). See src/lib/pricing/plans.ts.
-- Also makes sure the cached-translation column from 20260926140000 exists.

alter table public.proposals add column if not exists plans jsonb;
alter table public.proposals add column if not exists translations jsonb;
