# LLM Operator Guide

This guide helps Claude, Copilot, and other LLM agents run this project safely.

## 1) Project Purpose

Automates LinkedIn post scheduling and approvals with:

- A local post queue in SQLite
- Scheduler-driven content pipelines
- Admin web portal for control
- Playwright-based posting flow in visible Chromium

## 2) OS Command Matrix

### Install

macOS/Linux:

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Windows PowerShell:

```powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

### Core Runtime

```bash
node login.js
node scheduler.js
npm run web:start
```

### Manual Operations

```bash
node add-post.js "Post text"
node post-now.js
npm run post-now:auto
```

## 3) Login Workflow (Must Understand)

- Run `node login.js`
- Browser opens to LinkedIn login
- Human completes login and 2FA
- Press ENTER in terminal or wait up to 90 seconds
- Session gets saved to `auth.json`

When posting starts failing due to auth/session issues, run `node login.js` again.

## 4) Pipelines

- `work_context`: runs every 3 hours
- `rss_review`: runs every 6 hours

Portal/API controls:

- View pipelines: `GET /api/pipelines`
- Toggle pipeline: `PUT /api/pipelines/:key` body `{ "enabled": true|false }`
- Generate now: `POST /api/posts/generate` body `{ "pipeline": "work_context" }` or `{ "pipeline": "rss_review" }`

## 5) Posting Modes

- `confirm_email`: reply approval in email thread with `EMAIL_APPROVAL_SECRET`
- `confirm_push`: click push notification to approve
- `auto`: post immediately

Applies to both pipelines.

## 6) Required Environment Variables

- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_TO`
- `EMAIL_APPROVAL_SECRET`
- `IMAP_HOST`
- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
- `WORK_CONTEXT_URL`
- `REVIEW_RSS_FEED_URL`
- `WEB_PORT`

## 7) Suggested LLM Runbook

1. Verify Node version and dependencies.
2. Verify `.env` presence and required keys (do not print secret values).
3. Verify `auth.json` exists, otherwise run login.
4. Start requested service (`scheduler.js` or `web:start`).
5. Perform requested action (generate, toggle pipeline, post-now).
6. Validate result from logs/API/DB state.
7. Report status and precise next step.

## 8) Safety and Limits

- Do not reveal secrets.
- Do not run destructive git commands unless user explicitly asks.
- Keep browser visible for LinkedIn posting flow.
- Prefer email approval mode for remote-safe operations.
