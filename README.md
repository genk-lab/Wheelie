# Salvage Pulse — Wheelie chatbot

A production-shaped AI chatbot for **Salvage Pulse** that can:

- Answer customer questions about the product, plans, features, integrations, roles, security, and onboarding.
- Compare the five plans and recommend a fit.
- Book a real 1-on-1 yard demo through the team's **Cal.com** page.
- Answer **account-specific questions** after a visitor securely connects their yard account: plan, trial, seats, callbacks, QA scores, team, role-play assignments, and inventory watchlist (role permitting).
- Start a paid subscription with **Stripe Checkout** when Stripe is connected. Until then, purchase interest routes to sales for a secure payment link.
- Route sales/support messages to the right inbox.
- Run as a standalone chat page or as a floating widget on `site.salvagepulsepro.com`.

The UI uses the Salvage Pulse dark/cyan/amber visual language and is responsive down to phone width. The assistant is **Wheelie**, using the provided Wheelie character art and the primary car logo.

---

## 1. Quick start

Requires **Node.js 20+** (Node 22 LTS recommended).

```bash
cd salvage-pulse-chatbot
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:3000> for the bottom-right widget preview, or <http://localhost:3000/full> for the full-page chat.

The app runs without any keys. In that mode it uses a guided-script engine: plan cards, Cal.com demo cards, contact forms, account-aware answers, and curated FAQ answers all work. Add an LLM key for free-form conversation and tool calling.

### Production

```bash
npm install --omit=dev
npm start
```

Set `APP_BASE_URL` to the public URL. By default the server keeps its JSON store in `data/store.json`; set `DATABASE_URL` to use Postgres (recommended for production). See **Storage: Postgres** below.

### Docker

```bash
docker build -t salvage-pulse-chatbot .
docker run --rm -p 3000:3000 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  salvage-pulse-chatbot
```

The included `Dockerfile` runs on Node 22 Alpine. The volume is only needed when `DATABASE_URL` is not set.

### Hosting notes

- **Render / Railway / Fly.io** — deploy the repository as a Node web service with `npm start`, set the env vars from `.env.example`, and point `DATABASE_URL` at a Postgres instance. The `render.yaml` blueprint creates one for you.
- **Render one-click** — the blueprint creates the web service. Set `APP_BASE_URL`, `ALLOWED_ORIGINS`, `LLM_API_KEY`, and `DATABASE_URL` (Supabase Session pooler) in the dashboard after the first deploy.
- **VPS** — put the Node process behind Caddy/NGINX with TLS, or use `pm2`/`systemd`.
- **Serverless** — the Express app expects a long-lived process for the Stripe webhook. With Postgres configured, storage itself is fine on serverless-style hosts; keep the webhook on a long-lived instance or a platform that supports raw-body functions.
- Always set `ALLOWED_ORIGINS` to the exact marketing-site origin in production, and use a strong `ADMIN_TOKEN`.

### Storage: Postgres

Without `DATABASE_URL`, the app writes one JSON file (`data/store.json`). That is fine for local development, but ephemeral hosts wipe it on restart.

Set `DATABASE_URL` and the same code uses Postgres:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
# optional
DATABASE_SSL=true            # managed hosts with self-signed certs
DATABASE_POOL_MAX=5
```

On startup the server creates the table if it is missing:

```sql
CREATE TABLE wheelie_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

All app state lives in the `main` row and every update runs inside a transaction with `SELECT ... FOR UPDATE`. That keeps concurrent writes (chat events, bookings, contacts, Stripe webhooks) consistent across processes and instances. `GET /api/health` reports `"storage": "postgres"`.

- **Import an existing JSON store once:** `npm run import:json` (idempotent).
- **Check the connection:** `npm run check:db` prints the masked URL, SSL mode, and row counts, or explains auth/DNS/SSL failures.
- **Backups:** `pg_dump "$DATABASE_URL" > wheelie-backup.sql`.
- **Hosts:** Neon, Supabase, Railway, RDS, and Render Postgres all work; add `?sslmode=require` or set `DATABASE_SSL=true`. Supabase and Neon hosts are auto-detected and use TLS. The `render.yaml` blueprint expects `DATABASE_URL` to be set in the dashboard.
- **Supabase:** use **Connect → Session pooler**, not the direct `db.<project>.supabase.co` host. The direct host is IPv6-only unless the project has the IPv4 add-on. The pooler URL looks like:

  ```env
  DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
  ```

  URL-encode special characters in the password. Session mode (port 5432) fits this long-lived Node process; transaction mode (6543) also works.
- **Schema changes:** none are needed for normal use. If you later split the document into real tables, keep the `readStore`/`updateStore` functions in `server/store.js` as the seam.

---

## 2. Environment variables

Copy `.env.example` to `.env` and fill in what you need.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no | HTTP port (default 3000). |
| `APP_BASE_URL` | production | Public origin used in Stripe success/cancel URLs. |
| `ALLOWED_ORIGINS` | production | Comma-separated browser origins. Use `https://site.salvagepulsepro.com`. |
| `LLM_API_KEY` | recommended | OpenAI-compatible key. Without it the bot runs in guided mode. |
| `LLM_BASE_URL` | no | Default `https://api.openai.com/v1`. Works with compatible providers. |
| `LLM_MODEL` | no | Default `gpt-4.1-mini`. |
| `LLM_TIMEOUT_MS` | no | Provider request timeout (default 45 seconds). |
| `DATABASE_URL` | production | Postgres connection string. Empty uses `data/store.json`. |
| `DATABASE_SSL` | no | Force TLS on/off. Supabase and Neon are auto-detected. |
| `DATABASE_POOL_MAX` | no | Postgres pool size (default 5). |
| `APP_ORIGIN` | no | App origin for account-aware mode. Default `https://app.salvagepulsepro.com`. |
| `ACCOUNT_SESSION_MINUTES` | no | Account session lifetime (default 30 minutes). |
| `STRIPE_SECRET_KEY` | for checkout | `sk_test_...` or `sk_live_...`. Not required yet. |
| `STRIPE_WEBHOOK_SECRET` | production | `whsec_...` from the Stripe webhook endpoint. |
| `SMTP_*` | recommended | Contact notification email. Cal.com sends its own demo emails. |
| `ADMIN_TOKEN` | optional | Enables `/admin` and `/api/admin/summary`. Send it as `X-Admin-Token`. |
| `CALCOM_URL` | no | Defaults to the live demo link. Set to `internal` to use the built-in scheduler. |
| `DEMO_*` | no | Built-in scheduler time zone, slots, lead time, duration, capacity. |

**Never put these values in frontend code.** The browser only talks to this server.

---

## 3. AI provider

The server calls the OpenAI-compatible `POST /chat/completions` endpoint with tool/function calling. OpenAI works out of the box. Any gateway that implements the same request/response shape (Azure OpenAI proxy, OpenRouter, LiteLLM, Groq, Together, etc.) can be used by changing `LLM_BASE_URL` and `LLM_MODEL`.

### Connecting a key

1. Put the key and provider in `.env`:

   ```env
   LLM_API_KEY=sk-...
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_MODEL=gpt-4.1-mini
   ```

2. Verify it without starting the app:

   ```bash
   npm run check:llm
   ```

   It prints the base URL, model, masked key, latency, and the provider's reply. A 401 means the key does not match the provider; a 404 means the model or base URL is wrong.

3. Start the app and check `GET /api/health`. With a working key it returns `"llm": true` and `"llmModel": "<model>"`.

Examples for other providers:

| Provider | `LLM_BASE_URL` | Example `LLM_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| LiteLLM / vLLM | `http://localhost:4000/v1` | your alias |

The key stays server-side. The browser only calls this app's `/api/chat`. If the provider fails, times out (`LLM_TIMEOUT_MS`), or returns an empty message, the request is answered by guided mode and the failure is logged, so the chat never goes dead.

### Tuning

- `LLM_MODEL` — a small fast model is enough; the system prompt carries the product facts.
- `LLM_MAX_TOKENS` (default 900) and `LLM_TEMPERATURE` (default 0.25).
- `LLM_TIMEOUT_MS` (default 45000). Lower it if you want a faster guided-mode fallback.

The assistant is deliberately constrained:

- Curated knowledge base in `server/kb.js`; retrieval selects the most relevant sections per message.
- Strict system prompt: no invented prices, features, certifications, refunds, SLAs, or account data.
- No passwords or card numbers are requested in chat. Account sign-in uses a secure form; card data goes to Stripe only.
- If the provider errors or times out, the server transparently falls back to guided mode instead of failing the chat.

For a larger content set later, replace `retrieveKnowledge()` with embeddings + a vector store. The current keyword retrieval is intentionally dependency-free and good for a single product site.

---

## 4. Stripe setup

> **Current status:** Stripe is not connected in this deployment yet. The plan cards say **Talk to sales** and route purchase interest to the sales form; nothing pretends a checkout is live. The Stripe code below is ready when you add keys.

The chatbot sells the five plans shown on the site using **hosted Stripe Checkout** in subscription mode.

1. Create or open a Stripe account.
2. In test mode, copy the **secret key** into `STRIPE_SECRET_KEY`.
3. Set `APP_BASE_URL` to the URL Stripe should return to (localhost is fine in test mode).
4. Install the Stripe CLI and forward webhooks:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

5. In the chat, choose a plan → choose monthly/annual → **Continue to secure Stripe checkout**.
6. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.

What is implemented:

- `POST /api/checkout` creates a subscription Checkout Session with `price_data` (no dashboard product setup required).
- `success_url` → `/success.html?session_id={CHECKOUT_SESSION_ID}`, which verifies the session server-side.
- `cancel_url` → `/cancel.html` with no charge.
- `POST /api/stripe/webhook` verifies the signature and records `checkout.session.completed` / async success events.
- Purchases are de-duplicated by Checkout Session ID and stored in `data/store.json`.
- Promotion codes and billing-address collection are enabled by default.

Prices come from the same catalogue as the app: Starter $99/mo or $1,089/yr; Pro $249/mo or $2,739/yr; Pro Platinum $499/mo or $5,489/yr; Enterprise $649/mo or $7,139/yr; Enterprise Platinum $1,149/mo or $12,639/yr.

### Production notes

- Use `STRIPE_SECRET_KEY` only on the server.
- For live mode, create the webhook endpoint in the Stripe Dashboard and subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- The current implementation uses `price_data`. If you want Stripe Tax, coupons with fixed durations, or a shared product catalogue, create Prices/Products in Stripe and swap the line item for `price: "price_..."`.
- The chatbot creates the subscription immediately. The website's free 1-day trial is a separate flow; the checkout copy states that clearly.

---

## 5. Demo scheduling — Cal.com

The live demo booking page is:

**https://cal.com/gen-keech-avipdc/live-demo**

The chatbot presents a **Book a 1-on-1 yard demo** card with:

- A direct link to the Cal.com page.
- An optional inline Cal.com calendar (`?embed=true&theme=dark&layout=month_view`).
- Cal.com handles availability, confirmation emails, reschedules, and calendar invites.

Configuration:

```env
CALCOM_URL=https://cal.com/gen-keech-avipdc/live-demo
```

Set `CALCOM_URL=internal` only if you want to fall back to the built-in scheduler in `server/scheduler.js`. That scheduler remains in the project for offline/demo use, but it does not read the team's real calendar. Cal.com is the single source of truth for demos.

Booking records made on Cal.com live in Cal.com, not in this app's admin page. The admin page only shows legacy built-in demo bookings.

---

## 6. Embedding the widget

On `site.salvagepulsepro.com`, add this before `</body>`:

```html
<script src="https://chat.salvagepulsepro.com/widget.js" defer></script>
```

Optional attributes:

```html
<script
  src="https://chat.salvagepulsepro.com/widget.js"
  data-open="false"
  data-position="right"
  data-teaser="true"
  data-origin="https://chat.salvagepulsepro.com"
  defer
></script>
```

`data-origin` is only needed when the loader script is served from a CDN while the chat app lives on another host. Set `data-teaser="false"` to hide the automatic greeting bubble.

The loader injects a floating Wheelie bubble and a compact 360 × 540 chat panel anchored to the bottom-right. It posts `sp-chat-close` from inside the iframe when the visitor closes it. The widget inherits the site's page but is visually isolated, so the host page's CSS cannot break it.

Preview the widget without the marketing site at:

**http://localhost:3000/demo**


To replace the existing “Book a Demo” button with the chat:

```js
document.querySelector("#book-demo").addEventListener("click", () => {
  document.querySelector("#sp-chat-widget .sp-chat-button").click();
});
```

The full-page chat lives at `/full`; `/` shows the bottom-right widget preview.

---

## 7. Account-aware mode

Wheelie can answer questions about the visitor's own yard account. This is separate from the public product Q&A and is **read-only**.

### How it works

1. The visitor clicks **Account** in the chat header.
2. They sign in with their `app.salvagepulsepro.com` email and password in the secure Account panel.
3. The server sends those credentials to the app's `/api/auth/login`, keeps the app session server-side, and returns a random account token to the browser. The password is never stored.
4. The account token is kept in `sessionStorage` and expires after `ACCOUNT_SESSION_MINUTES` of inactivity.
5. Chat requests include the account token. The assistant can then use read-only account tools.

### What it can answer

- Plan, plan status, trial days left, rep seats, locations, billing interval, access state.
- QA score, call volume, close rate, category mix, and trends (role permitting).
- Open callbacks, team list, role-play assignments, and inventory watchlist.

### The one-time password requirement

The four Keech Auto demo accounts are currently on the app's **forced first-login password change**. The app allows account basics (`/api/auth/me`, `/api/org/me`) but returns `403` for call-level endpoints until the user replaces the starting password.

The Account panel handles this safely:

- It shows **Limited access** and explains why.
- It offers a one-time **Set my password** form.
- That form calls the app's `/api/auth/change-password`, changes the password on `app.salvagepulsepro.com`, and does **not** store the new password.
- Once changed, full account data unlocks.

> Changing the starting password means the original demo password stops working. The UI warns about this and tells the user to save the new password in their password manager.

### Security rules

- Passwords are never written to disk, logs, chat history, or the browser's local storage.
- Account sessions are in-memory and expire.
- The account token is random, scoped to this server, and read-only.
- The bot never asks for a password in chat; the secure form is the only place to enter one.
- Account tools are read-only. No cancelling, upgrading, deleting, or changing settings through chat.

### API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/account/login` | Authenticate against the app, create a server-side session. |
| `GET` | `/api/account/summary` | Refresh the connected account summary. |
| `GET` | `/api/account/data/:kind` | Read whitelisted account data (`performance`, `callbacks`, `team`, etc.). |
| `POST` | `/api/account/change-password` | One-time starting-password replacement. |
| `POST` | `/api/account/logout` | Drop the server-side app session. |

---

## 8. What the bot knows

`server/kb.js` contains a curated knowledge base built from the public site and the product's role/navigation structure:

- Product overview and the four-step workflow.
- Seven-metric scoring rubric (weights, criteria, call categories).
- Console and analytics, role-based views (owner/manager, inventory manager, rep).
- AI Role-Play Trainer and Demand Radar/auction intelligence.
- All five plans and exact annual prices.
- Free trial, onboarding, phone integrations (RingCentral, VoIP/webhooks, audio upload, PBX caveats).
- Login, password reset, roles, billing, Stripe security.
- ROI methodology (5.8% recovery assumption — explicitly an estimate).
- Account-aware answers and the starting-password limitation.
- Contact routing and troubleshooting.

The four Keech Auto demo accounts were used to audit role-based navigation and plan/feature data. **No credentials are stored in this project.** The bot never asks for a password in chat and does not authenticate as a customer unless the visitor signs in through the secure Account panel.

If the knowledge base does not cover something, the prompt requires the bot to say so and offer `sales@salvagepulse.com` or a demo rather than guess.

---

## 9. Project structure

```text
salvage-pulse-chatbot/
├─ server/
│  ├─ index.js        Express app, routes, webhook, static files
│  ├─ config.js       Env config + runtime warnings
│  ├─ chat.js         LLM loop, tool execution, guided fallback, account replies
│  ├─ llm.js          System prompt + tool schemas + provider call
│  ├─ kb.js           Curated knowledge base, plans, retrieval
│  ├─ account.js      Secure account sessions, read-only app data, password change
│  ├─ scheduler.js    Built-in fallback availability, booking, ICS
│  ├─ stripe.js       Checkout Sessions + webhook verification
│  ├─ mailer.js       SMTP contact notifications
│  ├─ store.js        Atomic JSON store
│  └─ util.js         Validation, time zones, ICS, formatting
├─ public/
│  ├─ index.html      Full chat page + account panel
│  ├─ app.js          Chat UI, Cal.com card, account UI, plan/contact/checkout flows
│  ├─ styles.css      Brand UI + embed mode + admin/status pages
│  ├─ widget.js       Floating Wheelie widget loader for the marketing site
│  ├─ demo.html       Widget preview page with Wheelie in the bottom-right
│  ├─ wheelie.jpg     Full Wheelie character art
│  ├─ wheelie-avatar.jpg  Cropped Wheelie avatar for chat bubbles and widget
│  ├─ salvage-pulse-logo.png  Primary car logo with transparent background
│  ├─ success.html    Post-checkout verification page
│  ├─ cancel.html     Cancel page
│  ├─ admin.html      Contact/legacy-demo/purchase dashboard
│  └─ 404.html
├─ tests/
├─ data/store.json    Created at runtime (gitignored)
└─ .env.example
```

### API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health + integration status. |
| `GET` | `/api/config` | Public config (Stripe/AI enabled, Cal.com, demo settings). |
| `GET` | `/api/plans` | Plan catalogue. |
| `POST` | `/api/chat` | Chat message + history + optional account token. |
| `POST` | `/api/account/login` | Secure app sign-in for account-aware mode. |
| `GET` | `/api/account/summary` | Account basics. |
| `GET` | `/api/account/data/:kind` | Read-only account data. |
| `POST` | `/api/account/change-password` | One-time starting-password replacement. |
| `POST` | `/api/account/logout` | End the account session. |
| `GET` | `/api/demo/availability` | Built-in scheduler slots (Cal.com is primary). |
| `POST` | `/api/demo/book` | Built-in scheduler booking (fallback only). |
| `POST` | `/api/contact` | Store + route a sales/support message. |
| `POST` | `/api/checkout` | Create a Stripe Checkout Session. |
| `GET` | `/api/checkout/status` | Verify a session after redirect. |
| `POST` | `/api/stripe/webhook` | Stripe signature verification + purchase record. |
| `GET` | `/api/admin/summary` | Protected activity summary. |

---

## 10. Tests

```bash
npm test
```

The suite covers:

- Knowledge retrieval and plan data.
- Guided intent routing for pricing, Cal.com demos, trials, and the no-Stripe sales handoff.
- Stripe-enabled checkout intent and Checkout Session payloads.
- Built-in scheduler time-zone conversion, slot generation, validation, duplicate prevention, and ICS output.
- Account login, password redaction, limited-mode behavior, password change, full-data unlock, and logout.
- The LLM tool loop with a mock OpenAI-compatible provider.

Add an end-to-end browser test (Playwright) before a paid launch. The most important paths are: Cal.com booking card, account connect, account-aware questions, Stripe test checkout, webhook receipt, and mobile widget open/close.

---

## 11. Security and privacy

- No card data touches this server; Stripe Checkout handles it.
- No app passwords are stored. Account sign-in trades the password for an in-memory app session; the browser receives a random, expiring account token.
- Account data is read-only and limited to a whitelist of endpoints.
- Input length limits, a per-IP rate limit, stricter account-login limits, and server-side validation on every write.
- HTML is escaped before rendering; assistant markdown is rendered through a small allow-list parser.
- Stripe webhook signatures are verified with the raw request body.
- `data/store.json` contains contact and purchase metadata. Treat it as business data: restrict file access, back it up, and add a retention policy.
- The admin page is disabled unless `ADMIN_TOKEN` is set, and uses a header token rather than a cookie.
- The bot's security answer intentionally avoids claiming certifications or specific retention periods that are not published.

---

## 12. Known limitations / sensible next steps

1. **Cal.com records** — bookings live in Cal.com. The admin page does not list them. Add a Cal.com webhook if you want bookings mirrored into this app.
2. **Starting passwords** — the Keech Auto demo accounts are blocked from call-level data until each user sets a new password. The Account panel handles it, but the original demo password stops working afterward.
3. **Stripe** — the code is ready; add keys when the account is connected. Until then, purchase interest goes to sales.
4. **CRM sync** — contacts currently go to email + JSON. Add HubSpot/Salesforce/GoHighLevel webhooks if the team uses one.
5. **Database** — JSON is fine for a single instance. Move to Postgres/SQLite for multi-instance deployments.
6. **Entitlements** — the chatbot cannot provision app accounts after payment yet. Add a webhook handler that creates the org/user or emails an onboarding link.
7. **Knowledge freshness** — when pricing or features change, update `server/kb.js` and `plans` together. Consider generating the KB from the marketing CMS.
8. **Observability** — add structured logs, error tracking (Sentry), and conversion analytics on demo clicks and checkout starts.

---

Built for Salvage Pulse — *Your data-driven solution.*
