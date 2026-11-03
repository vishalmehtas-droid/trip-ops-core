# Trip-ops Telegram Assistant — Implementation Plan

Status: planned, nothing built yet. Implement **one step at a time** and stop after each step for the owner to check the operations workflow before starting the next.

## 0. Background and goals

The owner wants to operate trip-ops from Telegram: send a message (text, voice note or screenshot) with lead details and have it stored, then extend the same pattern to other modules. The ideas come from Hermes Agent (messaging gateway, scheduler, voice, vision, session search, memory, skills, approvals), but **Hermes itself is not used**. Everything is built inside this app, deployed with it on Lovable/Cloudflare.

Single user: the owner only (decided 2026-11-03). Staff access is out of scope; keep the allowlist table so it could be added later, but build nothing for it.

### Decisions recorded (2026-11-03)

| Topic | Decision |
|---|---|
| Users | Owner only. No staff access. |
| AI provider | Google Gemini or Claude API. Recommended: **Gemini as the single provider** (accepts voice audio, images and structured JSON in one API, and handles Hindi/Hinglish speech). Claude API stays a drop-in option for text and image extraction behind `ai.ts`; it has no audio input, so voice notes would still need Gemini (or another speech-to-text service) for transcription. |
| Morning brief | **10:00 IST** daily (04:30 UTC). |
| Languages | Hindi, English and Hinglish (mixed Hindi-English, typed in Roman or Devanagari script), for text and voice. Bot replies and cards are in English; stored data (names, notes) is kept as typed, with the voice transcript shown on the card. |

### Non-negotiable rules (apply to every step)

1. **The database stays the source of truth.** The bot never bypasses RLS, triggers or permission checks. **Never use the Supabase service-role key** for bot actions.
2. **The AI only proposes, it never writes.** The model turns free text into a draft. Server code validates the draft with the existing zod schemas, resolves IDs, shows a confirmation card, and writes **only after the owner taps ✅**.
3. **Reuse existing business logic.** Call the same validation and insert logic the UI uses (see "Core function extraction" below). Do not duplicate rules.
4. **Money is exact.** Amounts travel as strings or paise integers, never floats, matching existing conventions in `AGENTS.md`.
5. **Follow AGENTS.md.** Keep the Lovable-connected branch working; no force-push or history rewrite; add a short convention line to `AGENTS.md` for each new rule introduced.
6. **Allowlist only.** The bot ignores every Telegram user not in the allowlist, silently.
7. **Kill switch.** `TELEGRAM_BOT_ENABLED=false` makes the webhook return 200 and do nothing.

---

## Architecture (shared by all steps)

```
Telegram ──POST──▶ /api/telegram/webhook (server route in this app)
                     │ 1. verify X-Telegram-Bot-Api-Secret-Token header
                     │ 2. dedupe by update_id
                     │ 3. allowlist check (telegram user id → profile)
                     │ 4. route: command | text | voice | photo | button press
                     ▼
              Bot service layer (src/lib/telegram/*)
                     │ AI extraction → zod validation → ID resolution
                     │ create pending action → send confirmation card
                     ▼  (on ✅ button)
              Core functions (same logic as UI server functions)
                     │ run as the dedicated bot user → RLS + triggers apply
                     ▼
                Supabase/Postgres
```

### Bot identity

- Create a dedicated trip-ops user, e.g. `telegram-bot@<company domain>`, with a normal profile and the **narrowest role set** that covers the enabled steps (start with the permissions for step 2: `leads.manage`, `leads.read`, `clients.manage`, `clients.read`, `destinations.read`). Add permissions only when a later step needs them.
- Server-side, the webhook signs in as that user with `supabase.auth.signInWithPassword` (publishable key + `BOT_USER_EMAIL` / `BOT_USER_PASSWORD` secrets), caches the access token until shortly before expiry, and builds an RLS-scoped client exactly like `requireSupabaseAuth` does.
- `created_by` columns default to `auth.uid()`, so records are attributed to the bot user automatically. `assigned_to` on leads is set to the **owner's** profile (from the Telegram link table), so leads appear in the owner's lists.

### Core function extraction

Server functions are wrapped in `requireActiveUser` middleware that reads the browser's bearer token, so the webhook cannot call them directly. Refactor **only the functions each step needs**:

- Move the profile/roles/permissions loading in `src/lib/authz-middleware.ts` into an exported `loadAuthorizedContext(supabase, userId)`; the middleware calls it, and the bot calls it with the bot client.
- For each needed server function, move the handler body into a plain exported function, e.g. `createLeadCore(ctx, data)`, in the same file or a sibling `*.core.ts`. The `createServerFn` handler becomes a one-line wrapper. Behaviour of the UI must not change.

### Server route

There are no server (API) routes in the app yet. Before writing one, **check the installed `@tanstack/react-start` (1.168.x) docs/types** for how file routes declare server handlers (e.g. `createFileRoute(...)({ server: { handlers: { POST } } })`) and follow that. Route path: `src/routes/api/telegram.webhook.ts` (or the equivalent for the installed version).

Telegram retries a webhook that fails or times out. The handler must:
- respond quickly; keep AI calls bounded with a timeout, and on timeout reply "Still working, try again" rather than hanging;
- be idempotent via the `telegram_updates` table (below).

### Secrets (Lovable Cloud → secrets; never commit)

| Name | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random string; set as `secret_token` in `setWebhook`, checked on every request |
| `TELEGRAM_BOT_ENABLED` | Kill switch, `true`/`false` |
| `BOT_USER_EMAIL`, `BOT_USER_PASSWORD` | Dedicated bot user credentials |
| AI provider key(s) | Depends on provider chosen in Step 0 |

### New tables (step 1 migration)

- `telegram_links` — `telegram_user_id bigint primary key`, `profile_id uuid references profiles`, `chat_id bigint`, `is_active bool`, `created_at`. The allowlist. One row for the owner.
- `telegram_updates` — `update_id bigint primary key`, `received_at`. Dedupe; prune rows older than 7 days.
- `bot_pending_actions` — `id uuid pk`, `telegram_user_id bigint`, `kind text` (e.g. `lead`, `receipt`), `payload jsonb` (validated draft with resolved IDs), `preview text`, `status text` (`pending|confirmed|cancelled|expired|failed`), `result jsonb` (created numbers/IDs or error), `expires_at timestamptz` (30 min), `created_at`, `updated_at`.

RLS: only the bot user and admins can read/write these tables. No anon access.

### Confirmation card pattern (reused by every write)

1. Bot sends a summary message with inline buttons: **✅ Save**, **✏️ Edit**, **✖ Cancel**. `callback_data` = `act:<verb>:<pending_id>` (stays under Telegram's 64-byte limit).
2. ✅ → re-load the pending row, check `status = pending` and not expired, run the core function, set `status = confirmed` + `result`, then **edit the card** to show "Saved LD-000045 / RQ-000052" and remove buttons. A second tap does nothing (idempotent).
3. ✏️ → bot asks "What should change?"; the next text message is merged into the draft (AI re-extraction with the previous draft as context), and a new card replaces the old one.
4. ✖ → `status = cancelled`, card edited to "Cancelled".
5. Any validation error from the core function or DB trigger is shown in plain words and the card offers ✏️ Edit again.

### AI extraction

- Provider is chosen in Step 0. Prefer one that supports **structured JSON output, audio and images**, so steps 2b reuse it. Keep the provider behind one small module `src/lib/telegram/ai.ts` with `extract(kind, input, context)`.
- The prompt includes: today's date in **Asia/Kolkata**, the owner's shorthand (step 6), and for leads the list of active destination names.
- Input may be Hindi, English or Hinglish (Roman or Devanagari). The prompt says so explicitly; Hindi number words and Indian amount shorthand ("dedh lakh", "1.5L", "50k", "pachas hazaar") must parse to exact amounts, and the card always shows the parsed value so the owner can check it.
- The model returns JSON matching a zod schema per kind; parse strictly. If required fields are missing or ambiguous (e.g. "next Friday" with no month context, two destinations with similar names), the bot **asks one question** instead of guessing.
- The model never receives IDs it could invent; server code resolves names to IDs.
- Privacy: client names/phones/trip details are sent to the AI provider. Note this in the settings page or README once chosen. Do not log raw message text or tokens in production logs.

---

## Step 0 — Decisions and setup (owner, before coding)

- [ ] Create the bot with @BotFather, get the token, disable "join groups" (private use only).
- [ ] Get the owner's Telegram numeric user id (e.g. from @userinfobot).
- [x] AI provider: Gemini or Claude API (see Decisions). Confirm the final pick and create the API key.
- [ ] Create the dedicated bot user in trip-ops and give it the step-2 permissions.
- [x] Morning-brief time: 10:00 IST.
- [ ] Add the secrets in Lovable Cloud.

## Step 1 — Foundation (no business writes yet)

**Goal:** a secure webhook that talks only to the owner and answers `/start`, `/help`, `/whoami`, `/ping`.

Build:
- Migration with the three tables above + RLS.
- `loadAuthorizedContext` refactor in `authz-middleware.ts` (UI behaviour unchanged).
- `src/lib/telegram/api.ts` — minimal Telegram Bot API client (`sendMessage`, `editMessageText`, `answerCallbackQuery`, `getFile`), using `fetch`; no new dependency needed.
- `src/lib/telegram/bot-auth.ts` — bot user sign-in + token cache + RLS client.
- Webhook route: secret header check → kill switch → dedupe → allowlist → command router.
- A one-off admin action (Settings page button or documented `curl`) to call `setWebhook` with `secret_token`, `allowed_updates: ["message","callback_query"]`.
- `/whoami` replies with the linked trip-ops profile name and the bot user's roles — proves auth + RLS work end to end.

Done when:
- Wrong/missing secret header → 401; unknown Telegram user → ignored (200, no reply); duplicate `update_id` → processed once.
- `/whoami` shows the right profile and permissions.
- `bun run lint` passes, existing tests pass, UI login and pages unchanged.

## Step 2 — Lead entry by typed message

**Goal:** "New lead – Rahul Sharma, 98xxxxxx10, Pune. Bali 12–18 Dec, 2 adults 1 child, 1 room, honeymoon, budget 1.5L" → confirmation card → ✅ → lead + travel requirement saved.

Data mapping (from `src/lib/leads-schemas.ts`, `master-schemas.ts`):
- **Client** (`clientInputSchema`): `name` required; `phone`, `city`, `email`, `source` optional. Resolve: normalise phone (digits, strip +91/0) and match an existing client by phone first, then exact/near name; if several match, ask the owner to pick (buttons). If none, the card says "Client: Rahul Sharma (new)".
- **Lead** (`leadValuesSchema`): `client_id`, `enquiry_date` (default today IST), `assigned_to` (owner's profile from `telegram_links`), `source` = `"Telegram"` unless the message says otherwise, `follow_up_date` optional, `notes` (any leftover text).
- **Requirement** (`requirementValuesSchema`): `destination_ids` (resolved against active destinations by case-insensitive name; unknown → ask, never auto-create), `travel_start_date`, `travel_end_date`, `adults ≥ 1`, `children ≥ 0`, `rooms`, `trip_type`, `budget` (e.g. "1.5L" → 150000), `notes`.

Database:
- New function `create_lead_with_requirement(...)` — **SECURITY INVOKER** (so RLS applies), one transaction: optional client insert, lead insert, requirement insert including `travel_requirement_destinations` in the given order (mirror exactly what `createRequirement` does today). Returns `lead_number`, `requirement_number`, ids. Numbering stays with the existing triggers (`LD-`, `RQ-`).
- Keep `createLead` / `createRequirement` validation as the source of rules: the core function validates with the same zod schemas and runs the existing `assertClientSelectable`, `assertAssigneeSelectable`, `assertActiveDestinations` checks before calling the RPC.

Card example:
```
New lead
• Client: Rahul Sharma (new) · 98xxxxxx10 · Pune
• Enquiry: 01 Nov 2026 · assigned to you · source Telegram
• Trip: Bali · 12 Dec – 18 Dec 2026 · 2 adults, 1 child · 1 room
• Type: Honeymoon · Budget ₹1,50,000
[✅ Save] [✏️ Edit] [✖ Cancel]
```

Also: `/lead LD-000045` shows a short status of a lead (read-only).

Done when:
- Happy path saves lead + requirement in one transaction and replies with both numbers; they appear in the app under Leads.
- Existing client by phone is reused, not duplicated.
- Unknown destination → bot asks; end date before start date → bot reports the schema error.
- Double ✅ tap creates one lead only; expired card (>30 min) refuses to save.
- If the requirement insert fails, no lead is left behind.

## Step 2b — Voice notes and screenshots

**Goal:** the same lead card from a voice note or a forwarded screenshot/photo of an enquiry.

- Voice: on `message.voice`, `getFile` → download (Telegram limit 20 MB) → transcribe with the chosen provider → feed transcript into the step-2 extraction. Show the transcript at the top of the card ("Heard: …") so mistakes are visible.
- Photo/screenshot: on `message.photo` (largest size) or image `document`, send the image to the vision model with the lead extraction schema. Caption text, if any, is added as extra context.
- Don't store audio/images; discard after extraction.

Done when: a clear voice note and a WhatsApp-style enquiry screenshot both produce correct cards; a blurry/unrelated image produces "I couldn't find lead details" rather than a guessed lead.

## Step 3 — Morning brief (scheduler)

**Goal:** every day at the chosen time the owner gets one Telegram message; `/brief` returns it on demand.

Contents (each section omitted when empty, max ~10 items each, with numbers like LD-/BK-):
- Follow-ups due today and overdue — open leads (`status` not won/lost) with `follow_up_date ≤ today`.
- New leads received yesterday.
- Trips starting in the next 7 days — `sales.travel_date`, excluding cancelled.
- Customer receivables overdue / outstanding — reuse `getReceivables` core logic.
- Vendor payables due — reuse purchases/payments summary logic.
- Yesterday's cash in/out — reuse `getDayEntries` / cashflow core logic.

Scheduling:
- `src/integrations/supabase/cron-auth.ts` (`authenticateCronRequest`, `LOVABLE_CRON_SECRET`) already exists but is unused — check how Lovable schedules cron calls for this project and use that: a server route `src/routes/api/cron.morning-brief.ts` guarded by `authenticateCronRequest`.
- Fallback if Lovable cron isn't available: Supabase `pg_cron` + `pg_net` calling the same route with the secret.
- Brief permissions: the bot user needs the matching `*.read` permissions (add `sales.read`, `receipts.read`, `purchases.read`, `payments.read`, `accounts.read` here, not earlier).

Done when: brief arrives once per day at the right IST time, `/brief` matches it, amounts match the app's reports exactly.

## Step 4 — Money entries (receipts, expenses, purchases, vendor payments)

Same card pattern; **every** money action is confirmation-only, amounts shown as ₹ with Indian grouping, never rounded. Add permissions one entry type at a time.

1. **Customer receipt** (`receiptCreateSchema`, `receipts.manage`): "Received 50,000 from Rahul for BK-000123 by UPI ref 4321". Resolve booking by `BK-` number, or client by name/phone (advance with no booking). `account_id`: default from the existing `my_last_account` DB function, shown on the card with a "Change account" button listing `list_selectable_accounts`. `method` must be one of `PAYMENT_METHODS`. The DB cap at customer payable applies; show its error plainly.
2. **Daily expense / other transaction** (`otherTxnInputSchema`, `accounts.manage`): "Paid 1,200 office internet from HDFC". Category from `listCategories`; ask if unclear.
3. **Purchase** (`purchases.manage`): booking + vendor + amount; vendor resolved by name; never auto-create vendors from money messages.
4. **Vendor payment** (`payments.manage`): uses the existing atomic `save_vendor_payment` RPC; allocations default to the oldest open purchase for that vendor/booking, shown on the card for confirmation.

Photo support from step 2b extends here: a UPI screenshot → receipt draft; a vendor bill → purchase draft.

Out of scope for the bot: cancelling, editing or deleting money records, issuing invoices. These stay in the app (invoice numbers are gapless and cancel-only, so mistakes are costly).

Done when: each entry type saves with the correct number (`RC-`, `OT-`, `PU-`, `PY-`), DB caps are respected and reported, and the app's ledgers/cashflow match.

## Step 5 — Ask questions (search + reports)

**Goal:** "What did Rahul ask for last time?", "Open Bali leads", "Who owes us money?", "Status of BK-000123".

- Commands first: `/find <text>`, `/lead <LD->`, `/booking <BK->`, `/receivables`, `/followups`.
- Free-text questions: the AI picks **one tool from a fixed read-only list** (search clients/leads, get lead, get booking, receivables, cashflow, ledgers) and the bot formats the result. **No AI-written SQL, no write tools in this path.**
- Search v1: `ilike` across client name/phone/city, lead notes and requirement notes. If that's slow or weak, add generated `tsvector` columns + GIN indexes in a migration.
- Answers respect the bot user's permissions (same `canAccessLedger` / role gates as the UI).

Done when: each example question returns correct, permission-respecting data; unrelated questions get "I can only look up trip-ops data".

## Step 6 — Memory and templates (learning)

**Goal:** fewer edits over time.

- `bot_aliases` table: `kind` (`client|destination|shorthand`), `alias`, `target` (id or expansion), `created_at`. Examples: `HM → honeymoon`, `2A1C → 2 adults 1 child`, `Rahul P → <client id>`, `Bali → <destination id>`.
- When the owner corrects a field via ✏️ Edit, the bot offers "Remember that 'HM' means Honeymoon?" [Yes] [No]. Saved only on Yes.
- Aliases are injected into the extraction prompt and applied in ID resolution before fuzzy matching.
- `/aliases` lists them; `/forget <alias>` removes one.
- `bot_templates` table: `name`, `kind`, `payload jsonb`. `/t bali-honeymoon Rahul 12-18 Dec` pre-fills trip type, rooms, notes, then shows the normal card. `/templates` lists them; templates are created from a saved draft ("Save as template").

Done when: a remembered alias changes the next extraction, and a template produces a correct card with only the variable parts typed.

---

## Step 7 — Quotes, bookings and alerts (added 2026-11-03)

Same confirmation-card pattern for writes; alerts are read-only.

- Supplier quote line from a message or a supplier's PDF/screenshot, against an `RQ-` requirement.
- Customer quote from a requirement ("make quote for RQ-52 at 15% markup") using the existing customer-quote server functions; reply with the share link so the owner can forward it on WhatsApp.
- "Rahul accepted" → convert the accepted quote to a booking via the existing conversion transaction; reply with the `BK-` number.
- Send an existing invoice PDF or quote share link on request (read-only; issuing invoices stays in the app).
- Alerts: customer opened a shared quote (from the existing view records), trip starting in 3 days with money still pending in or out, overdue receivables, uncleared entries awaiting reconciliation, weekly summary.

## Later (not planned in detail)

- **Team use (not wanted for now):** add more `telegram_links` rows; each staff member's actions run with a bot client scoped to **their** role (or one bot user per role) so the existing roles gate what each person can do.
- **Trip-ops MCP server** exposing the same read tools (and confirmation-gated writes) to AI assistants such as Claude.

## Verification approach for every step

- `bun run lint` and the existing `*.test.js` tests pass; add unit tests for pure helpers (phone normalisation, amount parsing "1.5L"/"50k", date parsing in IST, alias resolution, callback-data parsing).
- Test with a separate **test bot** token first; switch the webhook to the real bot only after the step is checked.
- Manually check the created records in the app UI and the audit log.
- Confirm the UI behaves exactly as before for the refactored server functions.

## Instructions for the implementing session

Work through the steps in order. At the start of each step, re-read this file and `AGENTS.md`, confirm the step's scope with the owner, implement, verify as above, then **stop and report** what was built, what was tested and anything not verified. Tick the step's boxes here and add one line per new convention to `AGENTS.md`. Do not start the next step until the owner has checked the operations workflow and says to continue.
