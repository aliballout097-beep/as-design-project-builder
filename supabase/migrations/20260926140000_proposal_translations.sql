-- Cached Arabic translation of the client-facing proposal text, used to render
-- the bilingual (Arabic + English) proposal PDF without re-translating on
-- every render. See src/lib/ai/translate.ts and src/lib/types.ts (ProposalTranslations).

alter table public.proposals add column if not exists translations jsonb;
