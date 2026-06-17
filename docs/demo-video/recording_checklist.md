# Recording Checklist

Use this checklist before recording the public demo.

## Browser Setup

- Use a clean Chrome profile made only for demos.
- Install the latest production or unpacked extension build.
- Pin the extension if needed.
- Set zoom to 90% or 100%.
- Hide bookmarks if they contain private links.
- Close private tabs, email, Slack, dashboards, and customer tools.
- Turn off desktop notifications.
- Use a neutral desktop wallpaper.

## Extension Setup

- Confirm the extension opens on LinkedIn profile pages.
- Confirm the plan badge shows "Beta Pro active" for the full feature demo.
- Confirm Backend API URL points to the production API.
- Confirm the license key is already activated.
- Do not show the license key on screen.
- Do not open DevTools during the recording unless recording a technical demo.

## LinkedIn Profile Setup

- Use a public demo-safe LinkedIn profile.
- Prefer a profile where name, headline, company, and location are visible without clicking "see more".
- Do not show private messages, connection requests, or inbox content.
- Do not scroll through unrelated personal posts.
- Do not record contact info modals.
- Do not click "Connect", "Message", or any LinkedIn action button.

## HubSpot Test Setup

- Use a HubSpot test account or a clearly marked test contact.
- Before recording, delete or archive previous duplicate demo contacts.
- Use a test lifecycle stage.
- Confirm the HubSpot Private App has the needed scopes for contacts, notes, and tasks.
- Confirm the contact timeline does not show private customer notes.
- If showing HubSpot, zoom in only on the test contact, note, or task.

## Stripe And License State

- Do not show Stripe Dashboard.
- Do not show payment links in admin tools.
- Do not show license keys.
- Do not show customer emails.
- If you need to show Beta Pro, show only the extension badge: "Beta Pro active".

## Tabs To Open

Recommended tabs:

1. LinkedIn public profile page.
2. HubSpot test contact search or test contact page.
3. Optional landing page or Chrome Web Store listing.

Avoid opening:

- Render dashboard.
- Stripe dashboard.
- Zapier dashboard.
- Source code with tokens.
- `.env` files.
- HubSpot private app settings.

## Recording Flow

1. Start on LinkedIn profile page.
2. Open the extension sidebar.
3. Click "Analyze Profile".
4. Show Lead Score, Persona, Pain Points, Icebreaker.
5. Click "First DM" or "Connection Message".
6. Show Suggested DM.
7. Click "Copy DM".
8. Click "Add to HubSpot".
9. Click "Create HubSpot Note".
10. Click "Create Follow-up Task".
11. Optionally switch to HubSpot test contact to show the saved contact, note, and task.
12. End on product name and CTA.

## Data To Avoid Showing

- Real customer emails.
- Real phone numbers.
- Private LinkedIn messages.
- HubSpot access tokens.
- OpenAI API keys.
- Stripe secrets.
- License keys.
- Internal Render logs with secrets.
- Private Zapier webhook URLs.
- Customer revenue, deal values, or pipeline data.

## Safe Demo Data

Use language like:

- "Example Corp"
- "Avery Johnson"
- "VP Sales"
- "Test contact"
- "Demo follow-up task"

For real LinkedIn profiles, show only information already visible on the public profile page.

## Final Safety Check

- Replay the recording once before publishing.
- Pause on every frame that shows HubSpot or extension settings.
- Blur or cut anything private.
- Confirm no secret keys, tokens, emails, or internal URLs are visible.
- Confirm the demo does not imply auto-messaging, crawling, scraping, or bulk automation.
