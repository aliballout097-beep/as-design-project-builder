# AS Design Studio: AI Automation Suite & Client Onboarding Platform

A full-stack platform for [asdesignlb.com](https://asdesignlb.com). Prospective clients describe their project in an interactive **Project Builder** and watch a live estimate take shape. An **AI scope & budget analysis** (Claude by default, OpenAI optional) drafts a proposal, a strategist reviews and approves it in the **agency dashboard**, and **n8n** handles the rest: client emails with the PDF, Telegram and WhatsApp alerts, and CRM sync.

```
Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Framer Motion · Zod 4
Supabase (Postgres + RLS) · Anthropic SDK · OpenAI SDK · react-pdf · n8n
```

---

## Contents

1. [What's inside](#whats-inside)
2. [Quick start (zero config)](#quick-start-zero-config)
3. [Architecture & data flow](#architecture--data-flow)
4. [Environment variables](#environment-variables)
5. [Supabase setup](#supabase-setup)
6. [n8n setup](#n8n-setup)
7. [API reference (`/api/v1`)](#api-reference-apiv1)
8. [Embedding on asdesignlb.com](#embedding-on-asdesignlbcom)
9. [Deployment](#deployment)
10. [Customising pricing, prompt & brand](#customising-pricing-prompt--brand)
11. [Security notes](#security-notes)
12. [Development](#development)

---

## What's inside

| Surface | Route | Highlights |
|---|---|---|
| **Project Builder** | `/` | A six-step Framer Motion wizard: services → vision → scope → budget & timeline → contact → review. A **live blueprint** prices the project from the rate card as the client chooses. Drafts are saved to `localStorage`, with a honeypot and minimum-fill-time spam checks. The vision step includes a **voice recorder** (mic capture, live level visualizer) that transcribes with Whisper and drops the text straight into the brief — English and Arabic (Gulf/Lebanese) both work, auto-detected. |
| **Embeddable builder** | `/embed` + `/widget.js` | Inline or popup embed for asdesignlb.com, with auto-height, UTM forwarding and an `asd:lead-submitted` DOM event. |
| **Client proposal portal** | `/p/{token}` | A private, branded proposal page: scope by phase, Gantt timeline, investment and payment schedule. The client can download the PDF and **accept or decline online**. Views are tracked. |
| **Proposal PDF** | `/p/{token}/pdf`, `/api/v1/proposals/{id}/pdf` | An A4 PDF rendered server-side with the brand fonts (Fraunces / Hanken Grotesk). **Bilingual**: each section shows its Arabic translation (Cairo font) above the original English — translated once by Claude and cached on the proposal (`src/lib/ai/translate.ts`). Uses Claude, or OpenAI when only `OPENAI_API_KEY` is set; English-only if neither is configured. |
| **Agency dashboard** | `/admin` | KPIs, a "needs attention" queue, a **real-time activity feed** (Server-Sent Events), leads and proposals trackers, and the AI analysis view (fit score, budget fit, risks, discovery questions). A **proposal editor** covers line items, phases, discount, tax and payment schedule, plus **regenerate with instructions** and **approve & send**. Settings shows integration health, n8n connection tests, and an **auto-send** toggle (on by default — see below). |
| **n8n templates** | `n8n/workflows/*.json` | Five importable workflows: lead intake, AI analysis, PDF, dispatch & alerts, CRM sync. They are generated from the same prompt, rate card and schema as the app. |

Everything is optional. With **no configuration** the app runs end-to-end: a local JSON store, the rule-based estimator instead of AI, and a development admin login.

---

## Quick start (zero config)

```bash
npm install
npm run dev            # http://localhost:3000
```

1. Open `http://localhost:3000`, fill in the Project Builder and submit.
2. Open `http://localhost:3000/admin` and sign in with the **development** login shown on the login page (`demo@asdesignlb.com` / `studio-demo`, enabled only when no admin is configured and `NODE_ENV` is not `production`).
3. Your lead is already in **Needs review**, with a proposal drafted by the rule-based estimator. Edit it, click **Approve & send**, then open **Client view** to accept it as the client would.
4. **Settings → Load demo leads** fills the dashboard with five fictional leads at different stages.

To turn on real AI, add `ANTHROPIC_API_KEY` to `.env.local` and restart. New briefs are then analysed by Claude (`claude-opus-5`).

---

## Architecture & data flow

```
                    ┌────────────────────────── Next.js app (automation.asdesignlb.com) ──────────────────────────┐
 Client ──brief──▶  │ POST /api/v1/onboard ─▶ lead (status: new) ─▶ after(): processNewLead                         │
                    │                                   │                                                           │
                    │     lead.created ─────────────────┼──────────▶ n8n 01 Lead Intake  → Telegram/WhatsApp + ack   │
                    │     analysis.requested ───────────┼──────────▶ n8n 02 AI Analysis  → Claude / OpenAI           │
                    │                                   │                        │                                  │
                    │ POST /api/v1/proposals ◀───────────────────────────────────┘ (normalise → proposal draft)     │
                    │           │  status: review  ── live SSE ──▶ /admin (strategist edits & approves)             │
                    │           ▼                                                                                   │
                    │     proposal.approved ────────────────────▶ n8n 04 Dispatch → n8n 03 PDF → email client       │
                    │ POST /api/v1/events ◀─── proposal.sent ─────────────┘                + Telegram/WhatsApp       │
                    │           │                                                                                   │
 Client ──accept──▶ │ /p/{token} → POST /api/v1/portal/{token}/respond → won ─▶ n8n 04 (🎉 alert + welcome email)   │
                    │                                                                                               │
                    │ every lifecycle change ── crm.sync ──────▶ n8n 05 CRM Sync → Airtable · Notion · Supabase    │
                    └───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**The lead state machine:** `new → analyzing → review → approved → sent → won | lost` (and `archived`). Every transition is written to `lead_events`. That table drives the activity feeds and is the cursor for the live stream.

**Auto-send (default: on).** By default a lead's first proposal skips the `review` stop and is approved + emailed to the client (PDF attached) the moment it's generated — no click required. Revised versions wait for "Approve & send". Turn this off in **Settings → Automation** to go back to manual approval. Demo-seeded leads are never auto-sent.

**Email delivery (`EMAIL_DELIVERY=app`, default once SMTP is set).** The app sends every email itself over SMTP (`src/lib/email`): the new-lead alert to `ADMIN_NOTIFY_EMAILS` (Reply-To = the client), the proposal email with the PDF attached to the client (plus a copy to the team), acceptance/decline alerts and the welcome email. Each send is retried and logged as `email.sent` / `email.failed` in the activity feed. n8n still receives every event for Telegram/WhatsApp/CRM, with `delivery.email = "app"` in the payload so its email nodes stay silent — and the approval is announced to n8n as `proposal.sent` (after the email went out) instead of `proposal.approved`.

**Nothing gets stuck.** If n8n accepts an analysis request but never posts a result (or reports `analysis.failed`), the app runs the analysis itself after `ANALYSIS_FALLBACK_MINUTES` (default 8). A background sweeper (`src/instrumentation.ts` → `src/lib/pipeline/sweeper.ts`) re-checks every 2 minutes for leads stuck in "analyzing" and approved proposals that never reached the client's inbox.

**Prices come only from the rate card.** Every price a client sees — the builder's live price, each plan, every proposal line, the PDF — is computed by one engine (`priceScope` in `src/lib/pricing/estimate.ts`) from the rate card: plan prices per service (e.g. website $150 Essential / $350 Professional / $650 Advanced / $900 Premium; AI website + system from $1,000), fixed-price items with quantities (logo $50, packaging $20, sticker $5, reel $35, ATS CV $20, cover letter $7, LinkedIn $30), add-ons, and a factor for edits to existing work (cheaper than new). The online payment gateway is never in the Essential plan. The AI reads the exact plan totals for each brief, picks a plan and writes the proposal — it never sets a price. **Edit everything in Settings → Pricing** (no code, no redeploy): the builder, new proposals and the AI (in-app and n8n — the app sends its live prompt with each request) use the new prices immediately. The current promotion (Settings → Automation) applies to the published packages only, as a separate discount line.

**Reading between the lines.** `src/lib/pricing/detect.ts` reads the project description for work the client didn't tick (e.g. they pick "Brand identity" but write that they need a website) and adds it to the priced scope, with conservative rules for Arabic and English (what the client already has, or says they don't want, is ignored). The builder shows it before they submit; the team email and the lead page say what was found.

**Who runs the AI?**

- `ANALYSIS_RUNNER=n8n` (the default when the n8n webhooks are configured): n8n workflow 02 calls Claude or OpenAI and posts the structured result to `POST /api/v1/proposals`.
- `ANALYSIS_RUNNER=app`: the app calls Claude or OpenAI itself inside `after()`. n8n still receives notifications if it is configured.
- If n8n is unreachable, the app falls back to running the analysis in-process. If the AI provider fails, it falls back to the rule-based estimator (`AI_FALLBACK_TO_HEURISTIC=true`). Either way the lead is never stuck, and the dashboard shows why a fallback happened.

**The AI request:**

- Model `claude-opus-5` with adaptive thinking (`effort: high`).
- Structured outputs (`output_config.format`, a JSON schema generated from the Zod schema by the Anthropic SDK), with streaming in-app.
- Server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- The system prompt contains the studio **rate card**, so prices are anchored on real rates. The brief sent to the model is **data-minimised**: no name, email or phone.
- The app **re-validates and normalises** every analysis: scores are clamped, money is rounded, phase references are repaired, and the recommended total is recomputed from line items. The dashboard, PDF and CRM can never disagree.

---

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is documented inline; the important ones are below.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of this app, e.g. `https://automation.asdesignlb.com`. Used in links, emails, PDFs and n8n payloads. **Build-time** (inlined). |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_BOOKING_URL`, `NEXT_PUBLIC_CURRENCY` | Brand and contact details shown to clients. |
| `NEXT_PUBLIC_OWNER_NAME` | Principal/owner name used in the AI persona and PDF signature (default `Ali Mawla`). |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Digits only, international format (e.g. `9613123456`). Shows a 1-click WhatsApp kickoff button in the site header when set; hidden otherwise. |
| `NEXT_PUBLIC_PHONE_DISPLAY` | Human-formatted phone shown in the proposal PDF footer, e.g. `+961 3 123 456`. Falls back to `NEXT_PUBLIC_WHATSAPP_NUMBER` if unset. |
| `OPENAI_API_KEY` | Also required for **voice-note transcription** (`POST /api/v1/transcribe`, Whisper) regardless of `AI_PROVIDER`. |
| `SESSION_SECRET` | **Required in production.** 32+ random chars: `openssl rand -base64 48`. |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` | Dashboard login. Generate the hash with `npm run admin:hash -- "long password"`. Add more admins with `ADMIN_USERS=a@x.com:hash,b@x.com:hash`. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Enables the Supabase store (server-side only). Without them: a local JSON file in `LOCAL_DATA_DIR`. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5`), `AI_EFFORT` | Claude analysis. `AI_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_MODEL` switch to OpenAI. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | The mailbox the app sends from (Hostinger: `smtp.hostinger.com`, 465, `info@asdesignlb.com`). Enables `EMAIL_DELIVERY=app`. |
| `ADMIN_NOTIFY_EMAILS` | Who gets new-lead / proposal-sent / accepted alerts (default `info@asdesignlb.com`). |
| `N8N_WEBHOOK_BASE_URL` | e.g. `https://n8n.asdesignlb.com/webhook`. The app appends `asd-lead-intake`, `asd-ai-analysis`, `asd-proposal-dispatch` and `asd-crm-sync`. Override each with `N8N_WEBHOOK_*`. |
| `N8N_WEBHOOK_SECRET` | App → n8n. Sent as `Authorization: Bearer …`, plus an `X-ASD-Signature` HMAC. |
| `N8N_CALLBACK_SECRET` | n8n → app. n8n authenticates to `/api/v1/*` with `Authorization: Bearer …`. |
| `EMBED_ALLOWED_ORIGINS` | Sites allowed to iframe `/embed` (CSP `frame-ancestors`). |
| `ALLOWED_ORIGINS` | CORS allow-list for posting to `/api/v1/onboard` from your own forms. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Shared rate limiting (recommended on serverless). Without them, limits are kept in memory per instance. |

---

## Email deliverability (inbox, not spam)

1. In Hostinger set `SMTP_USER=info@asdesignlb.com` and `SMTP_PASS=<mailbox password>` (host `smtp.hostinger.com`, port 465 are the defaults). The From address is the mailbox itself, so SPF (`include:_spf.mail.hostinger.com`), DKIM (`hostingermail-a._domainkey`) and DMARC all align on `asdesignlb.com`.
2. **Settings → Email delivery → Test lead alert / Test proposal email + PDF** sends real samples. Send one to the address shown on [mail-tester.com](https://www.mail-tester.com) and aim for 9–10/10.
3. Once tests pass, tighten DMARC from `p=none` to `v=DMARC1; p=quarantine; rua=mailto:info@asdesignlb.com; adkim=r; aspf=r` (DNS TXT `_dmarc`).
4. Every email is multipart (HTML + plain text), carries one small hosted logo, links only to the studio's own domains, and client subjects avoid emoji/ALL-CAPS.

## WhatsApp to clients

Clients who type a phone number in the Project Builder get "send it to me on WhatsApp too" switched on by default (they can turn it off). When the proposal goes out, the app sends the email **and** a WhatsApp message with the same PDF attached and a button to the private proposal page. The proposal counts as delivered if either channel reached the client; each attempt is logged in the lead's activity feed, and the team's "Proposal sent" email says how each channel went.

WhatsApp only lets a business start a conversation with an **approved template**, through Meta's official **WhatsApp Cloud API**:

1. [business.facebook.com](https://business.facebook.com) → WhatsApp Manager: add the studio's WhatsApp Business number (a number registered on the Cloud API).
2. Business Settings → System users → create one, give it the WhatsApp account with **whatsapp_business_messaging**, generate a **permanent token** → `WHATSAPP_TOKEN`.
3. WhatsApp Manager → API Setup → copy the numeric **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. WhatsApp Manager → Message templates → **Create template**, exactly like this:
   - Name `proposal_ready` · Category **Utility** · Language **Arabic**
   - Header: **Document**
   - Body: `أهلاً {{1}}، عرضك جاهز مع خطط تبدأ من {{2}} — الرقم المرجعي: {{3}}. ملف العرض مرفق، واختر خطتك ووافق عليها من الزر أدناه.`
   - Footer: `AS Design · Ali Mawla`
   - Button: **Visit website** → Dynamic URL `https://automation.asdesignlb.com/p/{{1}}`, text `اختر خطتك`
5. Once Meta approves it (usually minutes), set the env vars, redeploy, then **Settings → WhatsApp to clients → Send test WhatsApp**.

Unofficial "WhatsApp Web" gateways are not supported on purpose: they break Meta's terms and the number can be banned.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (a region close to your clients, e.g. `eu-central-1`).
2. Apply the schema, using **either** method:
   - **Supabase CLI:** `supabase link --project-ref <ref> && supabase db push`
   - **SQL editor:** paste the contents of `supabase/migrations/20260925000000_init.sql` and run it.
3. Copy **Project URL** and the **service_role** key (Settings → API) into `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

**Schema overview**

| Table | Purpose |
|---|---|
| `leads` | One row per brief. Nested JSONB (`contact`, `project`, `plan`, `estimate`, `meta`, `crm`), plus generated `contact_name`, `contact_email` and `company` for search. Status, fit score and estimated value are denormalised for the dashboard. |
| `analyses` | Versioned AI analyses per lead: provider, model, runner (`app`/`n8n`), full structured `result`, token `usage`, fallback reason. |
| `proposals` | Versioned proposals: line items, phases, discount, tax, payment schedule, computed `totals` (+ generated `total`), `share_token` for the client portal, and approval / sent / viewed / response timestamps. |
| `lead_events` | Append-only activity log (bigint identity). Feeds the dashboard's live stream. |
| `idempotency_keys` | Deduplicates n8n retries of `POST /api/v1/proposals` (`Idempotency-Key` header). |
| `crm_contacts` | *Optional* flat CRM table, target of n8n workflow 05's Supabase branch. |
| `storage.buckets/proposals` | *Optional* private bucket for PDFs archived by workflow 03. |

**Row Level Security** is enabled on every table with **no** policies for `anon` / `authenticated`, and privileges are revoked. Only the server, holding the service-role key, can read or write. Never expose the service-role key to the browser.

---

## n8n setup

n8n runs the automation layer. Use n8n Cloud or self-host it (see `docker-compose.yml`). The templates are verified by import and live execution on **n8n 2.40** (they also target 1.x) and use only built-in nodes: Webhook, Respond to Webhook, Set, Code, IF, Switch, HTTP Request, Telegram, Send Email, Convert to File.

### 1. Create the credentials first

Create these credentials in n8n with **exactly these names** before importing, and the workflows bind to them automatically. Otherwise, select them on each node after import.

| Credential name | Type | Value |
|---|---|---|
| `ASD · Webhook auth (app → n8n)` | Header Auth | Name `Authorization`, Value `Bearer <N8N_WEBHOOK_SECRET>` |
| `ASD · App API (n8n → app)` | Header Auth | Name `Authorization`, Value `Bearer <N8N_CALLBACK_SECRET>` |
| `ASD · Anthropic API key` | Header Auth | Name `x-api-key`, Value `sk-ant-…` |
| `ASD · OpenAI API key` *(optional)* | Header Auth | Name `Authorization`, Value `Bearer sk-…` |
| `ASD · Telegram bot` | Telegram API | Bot token from [@BotFather](https://t.me/BotFather) |
| `ASD · SMTP` | SMTP | Any SMTP provider (Google Workspace, Resend, Postmark, Brevo…) |
| `ASD · WhatsApp Cloud API token` *(optional)* | Header Auth | Name `Authorization`, Value `Bearer <Meta system-user token>` |
| `ASD · Airtable` *(optional)* | Airtable Personal Access Token | scopes `data.records:read/write` on the base |
| `ASD · Notion` *(optional)* | Notion API | internal integration shared with the database |
| `ASD · Supabase CRM` *(optional)* | Supabase API | host + service-role key of the CRM project |

### 2. Import the workflows

**Workflows → Import from file**, one per file in `n8n/workflows/`:

| File | Webhook path | Triggered by | What it does |
|---|---|---|---|
| `01-lead-intake.json` | `asd-lead-intake` | `lead.created` | Telegram (and optional WhatsApp) alert for the team, an **admin email** (`adminEmail` in Config), and an acknowledgement email to the client. **Second entry point** `asd-external-lead` imports leads from Typeform, Webflow, Meta Lead Ads and similar into `POST /api/v1/onboard`. |
| `02-ai-scope-analysis.json` | `asd-ai-analysis` | `analysis.requested` | Builds the prompt (rate card, data-minimised brief, JSON schema), then calls **Claude** (default) or **OpenAI**, checks the stop reason and parses the result. Posts to `POST /api/v1/proposals` (idempotent), then sends a "draft ready" alert, or an `analysis.failed` event and a failure alert. |
| `03-proposal-pdf.json` | `asd-proposal-pdf` | workflow 04 | A PDF microservice. `pdfEngine=app` downloads the app-rendered PDF; `pdfEngine=gotenberg` renders branded HTML with Gotenberg. Can archive to Supabase Storage. |
| `04-client-dispatch-alerts.json` | `asd-proposal-dispatch` | `proposal.approved/accepted/declined/created` | On **approval**: fetches the PDF (via 03) and delivers it to the client by **email and/or WhatsApp** per their chosen `deliveryChannel` (set in the Contact step), reports `proposal.sent` per channel, and alerts the team (Telegram/WhatsApp + **admin email**). On **acceptance**: 🎉 alert (+ admin email) and welcome email. Declines alert the team (+ admin email) too. |
| `05-crm-sync.json` | `asd-crm-sync` | `crm.sync` (every change) | Upserts one record per lead, keyed on **Reference**, into Airtable, Notion and/or Supabase, and reports the record ids back. |

### 3. Configure & activate

Open the **⚙️ Config** node in each workflow and set `appBaseUrl` and `telegramChatId`, plus the email sender and the toggles you want (WhatsApp, Airtable, Notion, Supabase). Then **activate** all five workflows. Only production webhook URLs (`/webhook/…`) are called.

Finally, set in the app:

```
N8N_WEBHOOK_BASE_URL=https://n8n.asdesignlb.com/webhook
N8N_WEBHOOK_SECRET=<same secret as the "Webhook auth" credential>
N8N_CALLBACK_SECRET=<same secret as the "App API" credential>
```

**Admin → Settings → n8n workflows → Test** sends a `test.ping` to each workflow and reports the HTTP status.

**Finding your Telegram chat id:** add the bot to a group (or message it), then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id`.

**WhatsApp:** Meta's Cloud API only delivers free-form text to numbers that messaged your business number in the last 24 hours. For always-on team alerts (`WhatsApp · Sent`, `WhatsApp · Accepted`), create an approved **template** and switch those node bodies to `type: "template"`.

**WhatsApp to clients:** workflow 04's `Send Client WhatsApp` node already sends `type: "template"` (a client almost never messaged you first). Before enabling `whatsappEnabled`, create and get approved a Meta message template whose body takes three variables — e.g. "Hi {{1}}, your proposal is ready — {{2}}. Review and accept: {{3}}" — and set its exact name in the `whatsappClientTemplateName` Config field. A client is only offered the WhatsApp/Both delivery option in the Project Builder if they marked their phone number as WhatsApp-enabled.

### CRM field mapping

Airtable table `Leads` (create these fields; `typecast` creates select options automatically):
`Reference` (primary, single line) · `Name` · `Email` (email) · `Phone` · `Company` · `Status` (single select) · `Services` (single line) · `Budget` · `Timeline` · `Source` · `Fit Score` (number) · `Estimated Value` (currency) · `Proposal Status` · `Proposal Total` (currency) · `Last Event` · `Created` (date) · `Dashboard` (URL) · `Proposal` (URL)

Notion database properties:
`Name` (title) · `Reference` (text) · `Email` (email) · `Phone` (phone) · `Company` (text) · `Status` (select) · `Services` (multi-select) · `Budget` (text) · `Timeline` (text) · `Fit Score` (number) · `Estimated Value` (number) · `Proposal Total` (number) · `Created` (date) · `Dashboard` (URL) · `Proposal` (URL)

### Lean editions (recommended with `EMAIL_DELIVERY=app`)

When the app sends every email and the client WhatsApp itself, n8n only needs to run the AI analysis. `n8n/workflows/lean/` holds trimmed editions without Telegram / WhatsApp / SMTP / Claude nodes (whose missing credentials would block publishing):

| File | Credentials |
|---|---|
| `lean/02-ai-scope-analysis-openai.json` | *ASD · Webhook auth*, *ASD · App API*, *ASD · OpenAI API key* |
| `lean/01-import-external-leads.json` *(optional)* | *ASD · Webhook auth*, *ASD · App API* |

Then turn off the events nobody listens to: `ANALYSIS_RUNNER=n8n`, `N8N_WEBHOOK_LEAD_INTAKE=off`, `N8N_WEBHOOK_DISPATCH=off`, `N8N_CRM_SYNC_ENABLED=false`.

### Regenerating the templates

The AI workflow embeds the system prompt, rate card and JSON schema from `src/`. After you edit `src/config/catalog.ts`, `src/lib/ai/prompt.ts` or `src/lib/schemas/analysis.ts`:

```bash
npm run n8n:build     # rewrites n8n/workflows/*.json — then re-import workflow 02
npm run n8n:check     # CI guard: fails if the committed JSON is stale
```

---

## API reference (`/api/v1`)

Auth: 🔓 public · 🍪 admin session cookie · 🔑 `Authorization: Bearer N8N_CALLBACK_SECRET`

| Method & path | Auth | Description |
|---|---|---|
| `POST /onboard` | 🔓 / 🔑 | Lead intake (Project Builder schema). Public calls are rate-limited (5 per 10 min per IP) and spam-checked. With a bearer token it's a trusted import (`source: api`). Returns `201 { reference, status, estimate }`. |
| `POST /proposals` | 🔑 | **n8n target.** `{ leadId \| leadReference, analysis, provider, model?, usage?, instructions?, durationMs? }` → validates, stores the analysis, creates the draft and moves the lead to `review`. Send an `Idempotency-Key` header. |
| `GET /proposals?leadId=&status=` | 🍪 🔑 | List proposals. |
| `GET /proposals/{id}` · `PATCH /proposals/{id}` | 🍪 🔑 · 🍪 | Read / edit (draft or approved only; editing an approved proposal reopens it). |
| `POST /proposals/{id}/approve` | 🍪 | Approve and hand off to n8n dispatch. The response includes `dispatch.delivered`. |
| `POST /proposals/{id}/mark-sent` · `/revise` | 🍪 | Manual send / copy to a new draft version. |
| `GET /proposals/{id}/pdf` | 🍪 🔑 | Proposal PDF (`?download=1` for an attachment). |
| `GET /leads` · `GET /leads/{id}` | 🍪 🔑 | Leads (search, status filter) / lead with analyses, proposals and events. |
| `PATCH /leads/{id}` · `DELETE /leads/{id}` | 🍪 | Status, notes and tags / permanent deletion (GDPR requests). |
| `POST /leads/{id}/analyze` | 🍪 🔑 | Regenerate the analysis, optionally with `{ instructions }`. |
| `POST /events` | 🔑 | **n8n target.** `proposal.sent`, `analysis.failed`, `crm.synced` (stores record ids), `email.sent`, `notification.sent`, `pdf.generated`, `custom`. |
| `POST /transcribe` | 🔓 | Voice intake. `multipart/form-data` with an `audio` field (≤25MB) → `{ text, language, duration }` via OpenAI Whisper (auto-detects English/Arabic). Rate-limited (10 per 10 min per IP). Requires `OPENAI_API_KEY`, independent of `AI_PROVIDER`. |
| `POST /portal/{token}/respond` | 🔓 | Client accepts (`{ decision: "accepted", name, agree: true }`) or declines. |
| `GET /health` | 🔓 | Liveness plus a database check. Admins also see integration status. |
| `GET /admin/stream` | 🍪 | Server-Sent Events activity feed (resumes with `Last-Event-ID`). |
| `POST /auth/login` · `/auth/logout` | 🔓 | Admin session. |

**Outbound webhook envelope** (app → n8n):

```jsonc
// Headers: Authorization: Bearer <N8N_WEBHOOK_SECRET>, X-ASD-Event, X-ASD-Delivery,
//          X-ASD-Timestamp, X-ASD-Signature: sha256=HMAC(secret, `${timestamp}.${body}`)
{
  "id": "uuid", "type": "lead.created", "createdAt": "…",
  "app": { "baseUrl": "https://automation.asdesignlb.com", "apiBase": "…/api/v1" },
  "lead": { "id", "reference", "status", "contact", "project", "plan", "estimate", "display": { … }, "aiBrief": { … } },
  "proposal": { "id", "status", "title", "lineItems", "phases", "totals", "paymentSchedule", "display": { "total", "monthly", "duration", "validUntil" }, … } | null,
  "links": { "admin", "proposal", "proposalPdf", "proposalApi", "proposalPdfApi" },
  "trigger": "…", "instructions": "…"      // event-specific extras
}
```

Deliveries are retried (backoff on 408, 429, 5xx and network errors). Failures show in the dashboard as `webhook.failed`.

---

## Embedding on asdesignlb.com

**Option A: inline builder**

```html
<div id="asd-project-builder"></div>
<script src="https://automation.asdesignlb.com/widget.js" data-target="#asd-project-builder" async></script>
```

**Option B: floating "Start a project" button with a modal**

```html
<script src="https://automation.asdesignlb.com/widget.js" data-mode="popup" data-label="Start a project" async></script>
<!-- open it from any element -->
<a href="#" data-asd-open>Get a proposal</a>
```

Options: `data-background="transparent"`, `data-position="left"`, `data-accent="#ff8a4c"`, `data-launcher="false"` (popup without the floating button). JS API: `window.ASDBuilder.open()` / `.close()`.

Analytics hook: `window.addEventListener("asd:lead-submitted", e => gtag("event", "generate_lead", { reference: e.detail.reference }))`.

The loader forwards the host page's `utm_*` parameters and URL, so attribution lands on the lead. Add the parent domains to `EMBED_ALLOWED_ORIGINS`.

**Option C: subdomain.** Host the platform at `automation.asdesignlb.com` (or `start.asdesignlb.com`) and link to it from the main navigation. Point a `CNAME` at your host (Vercel: `cname.vercel-dns.com`) and set `NEXT_PUBLIC_APP_URL`.

**WordPress / Webflow / Framer:** paste snippet A into an HTML / Embed block, or add snippet B to the site-wide footer code.

---

## Deployment

### Vercel (recommended with Supabase)

1. Import the repo into Vercel. The framework preset is detected.
2. Add the environment variables (`NEXT_PUBLIC_*` must be present at **build** time).
3. Add the domain `automation.asdesignlb.com`.
4. Use **Supabase** as the store (the local JSON store is not persistent on serverless), and **Upstash** for shared rate limiting.
5. Keep the default analysis runner (`n8n`), or with `ANALYSIS_RUNNER=app` make sure your plan allows ~300 s functions (`maxDuration` is set on the routes that may run the AI).

### Docker / VPS (self-hosted, with n8n + Gotenberg)

```bash
cp .env.example .env      # set secrets, N8N_ENCRYPTION_KEY, public URLs
docker compose up -d --build
# app → :3000, n8n → :5678 (put Caddy / Traefik / Nginx with TLS in front)
```

The image is the Next.js **standalone** build (`NEXT_OUTPUT=standalone`) and runs as a non-root user, with a health check on `/api/v1/health`. On a single server you can run without Supabase: the `app-data` volume persists the local store. Supabase is still recommended for backups and multi-instance setups.

### Production checklist

- [ ] `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` set; dev login disabled (automatic in production)
- [ ] Supabase migration applied; service-role key only in server env
- [ ] `N8N_WEBHOOK_SECRET` / `N8N_CALLBACK_SECRET` set in both the app and the n8n credentials; all five workflows active
- [ ] `EMBED_ALLOWED_ORIGINS` / `ALLOWED_ORIGINS` list only your domains
- [ ] SMTP sender domain has SPF, DKIM and DMARC records
- [ ] Rate card in `src/config/catalog.ts` reflects real pricing → `npm run n8n:build` → re-import workflow 02
- [ ] Privacy policy on asdesignlb.com mentions AI-assisted proposal preparation

---

## Customising pricing, prompt & brand

| What | Where |
|---|---|
| Default plan prices, items, add-ons, durations, deliverables, budgets, timelines, payment schedule | `src/config/catalog.ts` + `src/config/plans.ts` (defaults — edit live in **Settings → Pricing**) |
| AI system prompt & user message | `src/lib/ai/prompt.ts` |
| Structured output contract | `src/lib/schemas/analysis.ts` |
| Rule-based estimator (no-AI mode & fallback) | `src/lib/ai/heuristic.ts` |
| Brand name, principal/owner name (AI persona + PDF signature), monogram, WhatsApp kickoff number, phone shown in the PDF footer, colours for the PDF, contact details | `src/config/brand.ts` + `NEXT_PUBLIC_*` vars (`NEXT_PUBLIC_OWNER_NAME`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_PHONE_DISPLAY`) |
| Design tokens (colours, fonts, glass utilities) | `src/app/globals.css` (Tailwind v4 `@theme`) |
| Proposal PDF layout | `src/lib/pdf/ProposalDocument.tsx` |
| Email templates | Code nodes in n8n workflows 01 and 04 (`n8n/src/snippets.ts` for the shared layout) |

> Prices in `catalog.ts` are calibrated to AS Design's real, published rate card on asdesignlb.com/pricing. Re-sync them by hand if the published rates change — nothing here reads that page live.

---

## Security notes

- **Auth:** the admin session is an HS256 JWT in an `HttpOnly`, `SameSite=Lax` cookie (7 days). Passwords are hashed with scrypt, and login is rate-limited with uniform timing for unknown emails. `proxy.ts` does an optimistic check on `/admin`; every page and API handler re-verifies. Admin mutations reject cross-origin requests.
- **Webhooks:** bearer secrets are compared in constant time. Outbound requests carry an HMAC signature with a timestamp. Callbacks are idempotent.
- **Client portal:** 256-bit share tokens. Drafts are never exposed (404), links expire with `validUntil`, pages are `noindex`, and responses are rate-limited.
- **Data minimisation:** AI providers never receive client names, emails or phone numbers. IPs are stored only as salted hashes. `DELETE /api/v1/leads/{id}` erases a lead (GDPR / Lebanese Law 81/2018 requests).
- **Headers:** `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `frame-ancestors` (only `/embed` can be framed, and only by allowed origins), and `no-store` on the API.
- **Spam:** a honeypot field, a minimum fill time, per-IP rate limits and Zod validation with payload size limits.

---

## Development

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run lint         # ESLint (next/core-web-vitals + typescript)
npm run typecheck    # next typegen && tsc --noEmit
npm test             # Vitest: pricing, proposals, schemas, security, pipeline, n8n templates
npm run n8n:build    # regenerate n8n/workflows/*.json
npm run check        # all of the above (CI)
npm run build        # production build
```

```
src/
  app/                 routes — (site)/ builder & portal · embed/ · admin/ · api/v1/
  components/          builder/ · admin/ · proposal/ · site/ · ui/ (glass primitives)
  config/              catalog.ts (rate card) · brand.ts
  lib/
    ai/                Claude & OpenAI adapters, prompt, JSON schema, rule-based estimator
    db/                Repository interface · SupabaseRepository · LocalRepository
    pipeline/          lead state machine, n8n payloads
    auth/ pdf/ realtime/ schemas/ pricing/   …
  proxy.ts             admin guard + framing policy (Next.js 16 "proxy")
n8n/src/               workflow generator (TypeScript) → n8n/workflows/*.json
supabase/migrations/   Postgres schema with RLS
tests/                 Vitest suites
```
