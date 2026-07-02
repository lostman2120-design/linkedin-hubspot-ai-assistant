# LinkedIn to HubSpot AI Assistant

This tool helps a sales person work faster while looking at one LinkedIn profile.

It adds a sidebar to LinkedIn profile pages. The sidebar can read visible profile text, ask AI for a short sales analysis, write a draft LinkedIn message, and save useful information to HubSpot.

## What This Tool Does

- Analyzes the LinkedIn profile that is open now.
- Uses only text that is visible on the page.
- Creates an ICP fit score and a clear Recommended Action: Pursue now, Research more, Low priority, or Do not contact yet.
- Shows why the lead score was given, with visible evidence and clear AI inference labels.
- Shows an Outreach Strategy with relevance, angle, pain hypothesis, cautions, and a suggested CTA.
- Uses your saved Seller Context, so messages match what you sell.
- Drafts short LinkedIn messages for the user to review.
- Creates or updates one HubSpot contact.
- Saves the sales decision, evidence, outreach strategy, and AI summary note to HubSpot.
- Saves a follow-up task as a HubSpot note named "Follow-up Task".

## What This Tool Does Not Do

- It does not send LinkedIn messages.
- It does not browse LinkedIn by itself.
- It does not scrape many profiles.
- It does not read LinkedIn cookies.
- It does not read LinkedIn localStorage or sessionStorage.
- It does not find hidden LinkedIn data.
- It does not put API keys inside the Chrome extension.

## Free And Beta Pro Plans

You can install the Chrome extension for free.

Free plan:

- Analyze 3 LinkedIn profiles per day.
- Generate 1 First DM per day.
- See the lead score and a basic profile summary.
- HubSpot write actions are locked.
- Connection Message and Follow-up drafts are locked.

Beta Pro:

- Costs $19/month during beta.
- Unlocks all outreach drafts.
- Unlocks Seller Context powered scoring and message drafts.
- Unlocks HubSpot contact sync.
- Unlocks HubSpot AI summary notes.
- Unlocks follow-up task notes.
- Has no daily limit for normal use.

How paid access works:

1. The user clicks Upgrade in the sidebar.
2. Stripe opens the Beta Pro Payment Link.
3. After payment, Stripe sends a webhook to the backend.
4. The backend creates a license key.
5. The backend sends the license key to Zapier.
6. Zapier sends the customer an email with the license key.
7. The customer enters the key in the sidebar or Options page.
8. The extension asks the backend if the key is active.
9. Only active Beta Pro licenses unlock paid features.

Canceled, inactive, or past-due licenses do not unlock Beta Pro.

## Requirements

- Node.js 20 or newer
- pnpm
- Google Chrome
- An OpenAI API key
- A HubSpot Private App Token
- HubSpot's default Contact property for LinkedIn URL
- A PostgreSQL database for production license storage
- A Beta Pro license key if you want paid features

## Setup Steps

1. Open a terminal in this folder.
2. Install packages:

```bash
pnpm install
```

3. Copy the API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

On Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

4. Open `apps/api/.env` and add your keys.

After you load the Chrome extension, Chrome will show an extension ID. Add it to `apps/api/.env`:

```env
ALLOWED_EXTENSION_ORIGIN=chrome-extension://your_extension_id_here
```

Then restart the backend API.

To allow Beta Pro licenses, add one or more license keys to `apps/api/.env`:

```env
BETA_PRO_LICENSE_KEYS=key_one,key_two,key_three
```

This manual allowlist is only a development fallback. Production licenses are created by Stripe webhooks and saved in PostgreSQL.

## How To Set The OpenAI API Key

Put your OpenAI key in `apps/api/.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

The Chrome extension never stores this key.

## How To Set The HubSpot Private App Token

Create a HubSpot Private App with CRM contact, contact schema, note, and task permissions. The LHA property setup needs contact property schema read/write access. Then put the token in `apps/api/.env`:

```env
HUBSPOT_PRIVATE_APP_TOKEN=your_hubspot_private_app_token_here
```

The Chrome extension never stores this token.

This app uses HubSpot's default LinkedIn URL contact property, `hs_linkedin_url`, to find the same person again later.

## HubSpot Contact Properties And AI Notes

When you click **Add to HubSpot**, the app writes only safe, known data.

Standard HubSpot contact properties:

- `firstname`
- `lastname`
- `company`
- `jobtitle`
- `lifecyclestage`
- `hs_linkedin_url`

The app does not invent phone numbers, city, country, email address, or company domain. If that data is not visible or known, it stays blank.

AI analysis is always saved to a structured HubSpot note when the contact is created or updated. The note includes the LinkedIn URL, ICP fit, Recommended Action, confidence, reasons, missing information, risks, Outreach Strategy, DM variants, Seller Context summary, and analysis time.

v0.4.0 also creates and updates these LHA contact properties when the HubSpot token has property schema permission:

- `lha_icp_fit_score`
- `lha_icp_fit_label`
- `lha_recommended_action`
- `lha_confidence`
- `lha_outreach_angle`
- `lha_main_reason`
- `lha_main_risk`
- `lha_missing_info`
- `lha_last_analyzed_at`
- `lha_source`

Property creation is idempotent. The app uses only the `lha_` prefix and does not change existing user-created properties. If HubSpot blocks property creation or update, the contact and AI summary note are still saved and the extension shows a warning.

Optional AI contact properties:

- `ai_lead_score`
- `ai_lead_fit`
- `ai_persona`
- `ai_pain_points`
- `ai_icebreaker`
- `ai_suggested_dm`
- `ai_next_action`
- `ai_personalization_score`
- `ai_spam_risk`

Only enable these if you have created those custom Contact properties in HubSpot:

```env
HUBSPOT_SYNC_AI_CONTACT_PROPERTIES=true
```

You can also change each property name with the `HUBSPOT_AI_*_PROPERTY` variables in `apps/api/.env`. If a custom property is not configured or HubSpot rejects it, the contact still syncs and the AI details are saved as a note.

## How To Set The Stripe Payment Link

The extension uses a Vite environment variable for the Upgrade button.

Create `apps/extension/.env`:

```env
VITE_API_BASE_URL=http://localhost:8787
VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/4gMdR94zOalH6pebny8Vi00
```

If this file is missing, the extension uses the same default beta payment link.

For a production Chrome Web Store build, set:

```env
VITE_API_BASE_URL=https://your-production-api-domain
VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/your_live_payment_link
```

`VITE_API_BASE_URL` is used by the extension UI and by the generated `dist/manifest.json` host permissions. Do not package the extension for production while it still points to `localhost`.

## How To Set Beta Pro License Keys

Put test or customer license keys in `apps/api/.env`:

```env
BETA_PRO_LICENSE_KEYS=customer_key_1,customer_key_2
```

Do not put these keys in the Chrome extension code.

## How To Configure Stripe License Creation

Set these values in `apps/api/.env`:

```env
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
STRIPE_PAYMENT_LINK_ID=plink_your_payment_link_id
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

`STRIPE_PAYMENT_LINK_ID` is optional for local tests, but you should set it in production. It helps the backend accept only the correct Beta Pro Payment Link.

The backend stores production licenses in PostgreSQL. Local development can still use `DATABASE_URL=file:./data/license-db.json`, but that is not safe for production.

Create the production database tables with:

```bash
pnpm --filter @linkedin-hubspot-ai/api db:push
```

The schema is also visible in `apps/api/db/schema.sql`.

## How To Configure The Stripe Webhook

In the Stripe Dashboard:

1. Open Developers.
2. Open Webhooks.
3. Add an endpoint.
4. Use this endpoint URL:

```text
https://your-api-domain.com/api/stripe/webhook
```

For local testing with Stripe CLI, use:

```text
http://localhost:8787/api/stripe/webhook
```

Select these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Copy the webhook signing secret and put it in `STRIPE_WEBHOOK_SECRET`.

The backend verifies the Stripe signature before it does anything. Events without a valid Stripe signature are rejected.

## How To Configure Zapier Outlook License Email

Create a Zapier Zap:

1. Trigger: Webhooks by Zapier, Catch Hook.
2. Copy the Zapier webhook URL.
3. Put it in `apps/api/.env`:

```env
LICENSE_EMAIL_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/your_hook_id
```

4. Add an Outlook action that sends an email to the `email` field.
5. Use the `licenseKey` field in the email body.

Important: in the Microsoft Outlook action, map the "To Email(s)" field to the Catch Hook field named `email`. Do not type a fixed email address into "To Email(s)".

In the Zapier email body, insert only the `licenseKey` field once. If the license key appears twice in the received email, check the Zapier Body field for duplicate inserted data chips.

The backend sends Zapier this data:

```json
{
  "email": "customer@example.com",
  "licenseKey": "lh-beta-XXXX-XXXX-XXXX-XXXX",
  "productName": "LinkedIn to HubSpot AI Assistant — Beta",
  "chromeWebStoreUrl": "https://chromewebstore.google.com/detail/linkedin-to-hubspot-ai-as/mlioefhljfcgleibeibbifdemagocfld"
}
```

If the Zapier call fails, the Stripe webhook still succeeds. The backend logs the email error. `lastEmailSentAt` is saved only when the Zapier call works.

## Admin License Tools

Set an admin secret:

```env
ADMIN_SECRET=make_a_long_random_secret
```

List licenses:

```bash
curl -H "x-admin-secret: make_a_long_random_secret" http://localhost:8787/api/admin/licenses
```

Resend a license email:

```bash
curl -X POST http://localhost:8787/api/admin/licenses/resend \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: make_a_long_random_secret" \
  -d "{\"licenseKey\":\"lh-beta-XXXX-XXXX-XXXX-XXXX\"}"
```

Admin endpoints are disabled when `ADMIN_SECRET` is missing.

## How To Start The Backend API

Run:

```bash
pnpm --filter @linkedin-hubspot-ai/api dev
```

The API runs at:

```text
http://localhost:8787
```

Check it in your browser:

```text
http://localhost:8787/health
```

You should see:

```json
{
  "ok": true,
  "service": "linkedin-hubspot-ai-api",
  "port": 8787
}
```

## How To Build The Chrome Extension

Run:

```bash
pnpm build
```

The built extension will be in:

```text
apps/extension/dist
```

## How To Load The Chrome Extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select `apps/extension/dist`.
6. Open the extension Options page.
7. Make sure the Backend API URL is `http://localhost:8787`.
8. Add your product description and target customer profile.
9. Fill in Seller Context so the assistant knows what you sell.
10. Save the settings.
11. If you have a Beta Pro license key, add it in the License section and click Activate license.
12. Copy the extension ID from `chrome://extensions`.
13. Add `ALLOWED_EXTENSION_ORIGIN=chrome-extension://your_extension_id_here` to `apps/api/.env`.
14. Restart the backend API.

## Seller Context

Seller Context tells the assistant what you sell. It helps the score, outreach angle, and DM drafts feel specific instead of generic.

New users can start with one of five templates in Options: B2B SaaS Founder, HubSpot Consultant, RevOps Agency, Sales Agency, or Freelance Consultant. Applying a template asks before replacing existing context and does not save until you click **Save Settings**.

Open the Options page and fill in:

- Product or service name
- Product or service description
- Target outcome
- Main differentiators
- Proof points
- Pricing or pricing context
- Preferred CTA
- Claims allowed
- Claims to avoid
- Brand voice
- Competitors or existing alternatives
- Compatibility or coexistence context

Do not put API keys, passwords, tokens, or private internal secrets in Seller Context.

## How To Activate A License

You can enter a license key in two places:

- In the LinkedIn sidebar, inside the License section under the Upgrade card.
- In the extension Options page, inside the License section.

Steps:

1. Start the backend API.
2. Open a LinkedIn profile page and find the License section in the sidebar.
3. Paste your license key.
4. Click Activate license.
5. If the key is valid, you will see "License active".
6. The sidebar will show "Beta Pro".

If the key is not valid, you will see "Invalid license". If the API cannot check the key, you will see "Unable to verify license".

Click Remove license to go back to the Free plan.

## How To Test Valid And Invalid License Keys

1. Put a test key in `apps/api/.env`:

```env
BETA_PRO_LICENSE_KEYS=test_beta_key
```

2. Restart the backend API.
3. In the sidebar License section, enter:

```text
test_beta_key
```

You should see "License active", the plan badge should change to "Beta Pro", and locked buttons should unlock.

4. Remove the license.
5. Enter a key that is not in `BETA_PRO_LICENSE_KEYS`:

```text
wrong_key
```

You should see "Invalid license", and the extension should stay on the Free plan.

## How To Test Stripe Webhooks With Stripe CLI

Install and log in to the Stripe CLI. Then run:

```bash
stripe listen --forward-to localhost:8787/api/stripe/webhook
```

Stripe CLI prints a webhook secret. Put that value in `apps/api/.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_from_stripe_cli
```

Restart the backend API.

To test checkout, use the real Stripe Payment Link in test mode and complete a test subscription. The `checkout.session.completed` webhook should create a license.

During a successful checkout test, the API terminal should show logs like:

```text
[stripe-webhook] Incoming request received at /api/stripe/webhook.
[stripe-webhook] Stripe signature verification succeeded.
[stripe-webhook] checkout.session.completed received.
[stripe-webhook] Checkout customer details extracted.
[stripe-webhook] New license created.
[stripe-webhook] Calling license email webhook.
[license-email] Zapier license email webhook response.
[stripe-webhook] License email webhook completed successfully.
```

If `STRIPE_WEBHOOK_SECRET` is wrong, the API terminal should show:

```text
[stripe-webhook] Stripe signature verification failed
```

If Zapier fails, the API terminal shows the Zapier HTTP status and response text.

To test failed payment behavior, send or replay these events from Stripe CLI or the Stripe Dashboard:

```text
invoice.payment_failed
invoice.payment_succeeded
customer.subscription.deleted
```

Expected results:

- `invoice.payment_failed` changes the license to `past_due`.
- `invoice.payment_succeeded` and `invoice.paid` change the license back to `active`.
- `customer.subscription.deleted` changes the license to `canceled`.
- Past-due or canceled licenses no longer unlock Beta Pro.

## Production Deployment

Use a managed PostgreSQL database in production. A JSON file database is only okay for local development because it can be lost when a server restarts, redeploys, or scales to more than one instance.

### 1. Create A Neon PostgreSQL Database

1. Create a Neon project.
2. Copy the pooled PostgreSQL connection string.
3. Make sure it includes SSL, for example:

```env
DATABASE_URL=postgresql://user:password@host.neon.tech/database?sslmode=require
```

### 2. Deploy The API To Render

Create a Render Web Service for `apps/api`.

Build command:

```bash
corepack pnpm install --frozen-lockfile && corepack pnpm --filter @linkedin-hubspot-ai/shared build && corepack pnpm --filter @linkedin-hubspot-ai/api build
```

Start command:

```bash
corepack pnpm --filter @linkedin-hubspot-ai/api start
```

Set these Render environment variables:

```env
NODE_ENV=production
PORT=8787
ALLOWED_EXTENSION_ORIGIN=chrome-extension://your_production_extension_id
OPENAI_API_KEY=
HUBSPOT_PRIVATE_APP_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PAYMENT_LINK_ID=
LICENSE_EMAIL_WEBHOOK_URL=
ADMIN_SECRET=
DATABASE_URL=postgresql://user:password@host.neon.tech/database?sslmode=require
```

Run the database setup after the environment variables are set:

```bash
corepack pnpm --filter @linkedin-hubspot-ai/api db:push
```

You can run this from a local terminal with the production `DATABASE_URL`, or from a Render shell if available.

### 3. Create The Live Stripe Webhook

In the Stripe Dashboard, create a live webhook endpoint:

```text
https://your-production-api-domain/api/stripe/webhook
```

Select these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Copy the live webhook signing secret into Render as `STRIPE_WEBHOOK_SECRET`.

### 4. Configure Zapier

Set `LICENSE_EMAIL_WEBHOOK_URL` to your Zapier Catch Hook URL.

In Zapier Outlook, map "To Email(s)" to the Catch Hook field named `email`. Insert the `licenseKey` field only once in the email body.

### 5. Build The Production Extension

Bash:

```bash
VITE_API_BASE_URL=https://your-production-api-domain VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/your_live_payment_link corepack pnpm --filter @linkedin-hubspot-ai/extension build
```

PowerShell:

```powershell
$env:VITE_API_BASE_URL="https://your-production-api-domain"
$env:VITE_STRIPE_PAYMENT_LINK="https://buy.stripe.com/your_live_payment_link"
corepack pnpm --filter @linkedin-hubspot-ai/extension build
```

After the build, check `apps/extension/dist/manifest.json`. Its `host_permissions` should include your production API origin, such as:

```json
"https://your-production-api-domain/*"
```

It must not use `https://*/*` or `<all_urls>`.

### 6. Package The Extension

Update the manifest version in `apps/extension/public/manifest.json` before packaging.

Bash:

```bash
cd apps/extension/dist
zip -r ../../../linkedin-hubspot-ai-assistant.zip .
```

PowerShell:

```powershell
Compress-Archive -Path apps/extension/dist/* -DestinationPath linkedin-hubspot-ai-assistant.zip -Force
```

Upload the zip file to the existing Chrome Web Store item.

### 7. Production Verification

Before publishing:

1. Open `https://your-production-api-domain/health`.
2. Confirm it returns `ok: true`.
3. Complete a Stripe live or test checkout.
4. Confirm Render logs show `checkout.session.completed`.
5. Confirm one license is created.
6. Confirm Zapier sends the license email to the customer email.
7. Activate the license in the extension.
8. Confirm the plan badge changes to Beta Pro.
9. Cancel the test subscription.
10. Verify the license changes to `canceled`.
11. Verify the extension returns to Free plan after checking the canceled key.

## Chrome Web Store Update Checklist

Before uploading the new package:

1. Run `pnpm build`.
2. Run `pnpm test`.
3. Run `pnpm lint`.
4. Load `apps/extension/dist` as an unpacked extension.
5. Confirm Free plan shows locked premium features.
6. Confirm Upgrade opens the Stripe Payment Link.
7. Confirm the sidebar License section is visible.
8. Confirm a valid license changes the badge to Beta Pro.
9. Confirm Remove license returns the user to Free plan.
10. Confirm the sidebar scrolls to the last button and status message.
11. Zip `apps/extension/dist`.
12. Upload the zip in the Chrome Web Store Developer Dashboard.

## How To Use It On LinkedIn

1. Start the backend API.
2. Open one LinkedIn profile page.
3. The sidebar appears on the right side.
4. Click Analyze Profile.
5. Review the ICP Fit Score and the "Why this score?" evidence.
6. Review the Messaging context summary.
7. Click Generate Connection Message, Generate First DM, or Generate Follow-up.
8. Review the message yourself.
9. Click Copy DM if you want to paste it manually.
10. Click Add to HubSpot to create or update the contact.
11. Click Create HubSpot Note to save the AI summary.
12. Click Create Follow-up Task to save a follow-up note in HubSpot.

## HubSpot Follow-up Task Method

This version saves follow-up tasks as HubSpot notes titled "Follow-up Task".

This is a working fallback. It avoids a fragile Task API setup because HubSpot task associations can be different between accounts. The note includes the title, due date, and task details.

## Common Errors And Fixes

### "The backend API could not be reached"

Make sure the API is running:

```bash
pnpm --filter @linkedin-hubspot-ai/api dev
```

Also check the Backend API URL in the extension Options page.

If the API is running but the extension still cannot connect, check `ALLOWED_EXTENSION_ORIGIN` in `apps/api/.env`. It must match your Chrome extension ID.

### "The OpenAI API key is missing"

Add `OPENAI_API_KEY` to `apps/api/.env`, then restart the API.

### "The HubSpot Private App Token is missing"

Add `HUBSPOT_PRIVATE_APP_TOKEN` to `apps/api/.env`, then restart the API.

### "Invalid license"

For local development, check that the key is in `BETA_PRO_LICENSE_KEYS`. For production, check that Stripe created an active license in PostgreSQL and that the subscription is not canceled or past due.

### "Unable to verify license"

Make sure the backend API is running and the Backend API URL in Options is correct.

### "HubSpot API error"

Read the HubSpot error message shown by the extension. It now includes the real HubSpot message, category, and correlation ID when HubSpot sends them.

### "Unable to extract this field"

LinkedIn may have changed its page layout, or that field may not be visible on the profile. The app does not click "see more" and does not look for hidden data.

## Security Notes

- API keys live only in `apps/api/.env`.
- The extension stores user settings, daily Free plan counters, and the license key in Chrome storage.
- OpenAI and HubSpot secrets are never stored in the Chrome extension.
- The backend checks inputs with zod.
- The backend has CORS restrictions.
- The backend has simple rate limiting.
- The app does not read LinkedIn cookies, localStorage, or sessionStorage.
- The app sends visible profile information to the backend and then to OpenAI for analysis.

Read more in `docs/SECURITY.md` and `docs/LINKEDIN_SAFETY_POLICY.md`.

## Developer Commands

Install:

```bash
pnpm install
```

Build everything:

```bash
pnpm build
```

Run tests:

```bash
pnpm test
```

Run the API:

```bash
pnpm --filter @linkedin-hubspot-ai/api dev
```

Create or update the production license database schema:

```bash
pnpm --filter @linkedin-hubspot-ai/api db:push
```

Build only the extension:

```bash
pnpm --filter @linkedin-hubspot-ai/extension build
```
