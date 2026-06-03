# Security

This app is built so secret keys stay on the backend server.

## Where Secrets Live

- `OPENAI_API_KEY` lives in `apps/api/.env`.
- `HUBSPOT_PRIVATE_APP_TOKEN` lives in `apps/api/.env`.
- `BETA_PRO_LICENSE_KEYS` lives in `apps/api/.env`.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` live in `apps/api/.env`.
- `ADMIN_SECRET` lives in `apps/api/.env`.
- The Chrome extension does not store these keys.
- The Chrome extension stores the user's license key only in `chrome.storage.local`.
- Do not commit `.env` files to git.
- Do not commit the license database file from `apps/api/data/`.

## Data Flow

1. The user opens one LinkedIn profile.
2. The user clicks a button in the sidebar.
3. The extension reads visible text from the current page.
4. The extension sends that visible text to the backend API.
5. The backend sends only the needed data to OpenAI or HubSpot.

## LinkedIn Data Limits

The extension does not read:

- cookies
- localStorage
- sessionStorage
- hidden fields
- other profile pages

It also does not click "see more" buttons.

## API Protections

- Requests are validated with zod.
- CORS allows only configured origins and local development origins.
- The backend uses simple rate limiting.
- Error messages are written for users and avoid dumping raw personal data.
- Beta Pro license keys are checked on the backend, not in the extension code.
- Stripe webhooks must pass signature verification before the backend creates or updates a license.
- Admin license endpoints require `ADMIN_SECRET`.

## Production Notes

Before using this in production:

- Use HTTPS for the backend API.
- Set `ALLOWED_EXTENSION_ORIGIN` to the real Chrome extension origin.
- Limit HubSpot Private App permissions to only what this app needs.
- Rotate tokens if they are ever exposed.
- Review your company's privacy and security rules.
