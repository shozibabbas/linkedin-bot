# LinkedIn Human-in-the-Loop Bot (macOS, Linux, Windows)

Local LinkedIn automation with a queue, scheduler, admin portal, and two AI content pipelines:

- Work context pipeline: every 3 hours
- RSS review pipeline: every 6 hours

Both pipelines use the same posting mode controls:

- `confirm_email`
- `confirm_push`
- `auto`

## Features

- SQLite-backed post queue (`posts.db`)
- Cross-platform scheduler (`node-cron`)
- Visible browser automation (`playwright`, Chromium)
- Session persistence via `auth.json`
- Email approvals and result notifications (`nodemailer`, `imapflow`)
- Web admin UI (React + Express)
- Pipeline toggles and posting mode controls from the portal
- AI generation with anti-repeat context

## Prerequisites

- Node.js 20+
- npm
- Chromium installed through Playwright
- A LinkedIn account with manual login access (including 2FA if enabled)

## 1) Install (All OS)

### macOS / Linux

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

### Windows PowerShell

```powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

Fill `.env` with required values:

- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_TO`
- `EMAIL_APPROVAL_SECRET`
- `IMAP_HOST`
- `OPENAI_API_KEY`

Recommended optional values:

- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `WORK_CONTEXT_URL`
- `REVIEW_RSS_FEED_URL` (default: `https://dev.to/feed`)
- `WEB_PORT` (default: `60396`)

## 2) Login Step (Important)

Run:

```bash
node login.js
```

What happens:

1. Chromium opens to LinkedIn login.
2. You complete username/password and any 2FA manually.
3. Press ENTER in terminal when done, or wait up to 90 seconds.
4. Session is saved to `auth.json`.

Notes:

- If login expires later, run `node login.js` again.
- Keep `auth.json` private; it contains session state.
- If your terminal is non-interactive, the script waits 90 seconds automatically.

## 3) Start System

### Scheduler + pipelines

```bash
node scheduler.js
```

Or:

```bash
npm run start
```

### Web admin portal

```bash
npm run web:start
```

Portal URL:

- `http://localhost:60396` (or your `WEB_PORT`)

## 4) Pipelines

### Work Context Pipeline (3-hour cadence)

- Source: `WORK_CONTEXT_URL`
- Uses scraped context + prior posts to generate posts
- Rotates content type by timeslot for variety

### RSS Review Pipeline (6-hour cadence)

- Source: `REVIEW_RSS_FEED_URL`
- Picks the most relevant article against work context
- Generates a senior-style review post
- Includes article URL naturally in the post body

### Enable/Disable Pipelines

Use the admin portal Automation section:

- Toggle each pipeline `On` / `Off`
- Use `Generate now` per pipeline

## 5) Posting Modes (Apply to Both Pipelines)

- `confirm_email`: sends approval email, waits for reply containing `EMAIL_APPROVAL_SECRET`
- `confirm_push`: sends local push notification, click to approve
- `auto`: posts immediately when a pipeline creates a post

All modes keep result emails for posted/failed outcomes when email is configured.

## 6) Common Commands

### Add a manual post

```bash
node add-post.js "My LinkedIn content"
```

### Trigger posting flow now (with normal approvals)

```bash
node post-now.js
```

### Trigger posting flow now (auto-approved)

```bash
npm run post-now:auto
```

### Login refresh

```bash
node login.js
```

## 7) Windows and Linux Notes

- Core flow works on all OS because posting uses Playwright with visible Chromium.
- macOS has AppleScript approval dialogs; other OS use the in-browser approval fallback.
- Desktop notification behavior can vary by environment and notification daemon.
- On headless Linux servers, GUI/browser-based flows require a desktop session or virtual display.

## 8) Background Run Guidance

### macOS

- Use LaunchAgent with `launch-agent-entry.js`.

### Linux

- Use a `systemd` service for `node launch-agent-entry.js`.

### Windows

- Use Task Scheduler to run `node launch-agent-entry.js` at logon/startup.

## 9) Database

Primary DB: `posts.db`

Posts include pipeline metadata:

- `source_pipeline`
- `source_reference`

Statuses:

- `pending`
- `posted`
- `failed`

## 10) LLM Operator Docs

For AI-agent friendly operation, see:

- `LLM_OPERATOR_GUIDE.md`
- `.github/skills/linkedin-bot-ops/SKILL.md`
- `AGENTS.md`

These files document install, login, commands, safety checks, and execution patterns for Claude, Copilot, and similar LLM agents.
