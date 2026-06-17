# Tester Licenses

Tester licenses let selected external testers use the full Beta Pro or Pro feature set without paying through Stripe.

They are private admin-created licenses. There is no public license creation endpoint, and the Chrome extension does not expose tester controls.

## How Tester Licenses Work

- `source` is `tester`.
- `status` is `active` when created.
- `plan` is `beta_pro` or `pro`.
- Stripe customer, subscription, and checkout session IDs stay empty.
- `expiresAt` is set from the number of days you choose.
- `revokedAt` is empty until you revoke the key.

A tester license unlocks paid features only when:

- status is `active`
- plan is `beta_pro` or `pro`
- source is `tester`
- `revokedAt` is empty
- `expiresAt` is empty or in the future

Expired tester licenses return:

```json
{
  "valid": false,
  "plan": "free",
  "status": "expired",
  "message": "This test license has expired."
}
```

Revoked licenses return:

```json
{
  "valid": false,
  "plan": "free",
  "status": "revoked",
  "message": "This license is no longer active."
}
```

## Create a 7-Day Tester Key

From the repository root:

```bash
corepack pnpm license:create-tester --label "Chaofan feedback test" --plan beta_pro --days 7
```

With an email:

```bash
corepack pnpm license:create-tester --email "tester@example.com" --label "Chaofan feedback test" --plan beta_pro --days 7
```

In production, set `DATABASE_URL` to the production Postgres database. If `NODE_ENV=production`, add:

```bash
--confirm-production
```

The create command prints the full license key only once. Store it securely and do not paste it into screenshots, videos, GitHub issues, or public docs.

## Inspect a License Safely

```bash
corepack pnpm license:inspect --key "LICENSE_KEY"
```

The inspect command masks the license key in output.

## Revoke a License

```bash
corepack pnpm license:revoke --key "LICENSE_KEY"
```

Revocation sets `revokedAt` and changes the stored status to `inactive`. The verification API will return `status: "revoked"`, so the extension returns to the Free plan after verification.

## List Tester Licenses

```bash
corepack pnpm license:list-testers
```

The list command shows masked keys only.

## Local Development

For local JSON-file development only, add:

```bash
--allow-local
```

Do not use the JSON file for production.

## Deploying the Backend Change

1. Deploy the API code.
2. Run the DB setup command against production Postgres:

```bash
corepack pnpm --filter @linkedin-hubspot-ai/api db:push
```

The schema update is backward compatible and uses `ALTER TABLE ... IF NOT EXISTS`.

## Chrome Web Store Update

Valid tester keys return the same active paid-plan shape the extension already understands, so a backend-only deployment is enough for activation.

A Chrome Web Store update is recommended if you want the extension UI to show the newer tester-specific messages:

- `This test license has expired.`
- `This license is no longer active.`
- `Pro active` for `plan: "pro"`

## Cleanup

Expired tester records can be left in the database for audit history. If you need cleanup later, export the masked list first and delete only old tester records after confirming they are no longer needed.

Never delete Stripe-paid customer records as part of tester cleanup.
