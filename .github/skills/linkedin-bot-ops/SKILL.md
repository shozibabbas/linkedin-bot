---
name: linkedin-bot-ops
description: "Use when operating this repository with an LLM: setup, login refresh, scheduler/web startup, pipeline toggles, posting-mode verification, and safe command execution for LinkedIn posting workflows on macOS/Linux/Windows."
---

# LinkedIn Bot Operations Skill

## Purpose

This skill gives an LLM a reliable workflow to operate the LinkedIn bot safely and consistently.

## Use When

- User asks to install or run the bot
- User asks to refresh LinkedIn login session
- User asks to generate content or post now
- User asks to troubleshoot scheduler, pipeline, or web portal behavior
- User asks for commands for macOS, Linux, or Windows

## Core Facts

- Node runtime: Node 20+
- Main scheduler entry: `node scheduler.js`
- Combined startup entry: `node launch-agent-entry.js`
- Web admin entry: `npm run web:start`
- Login entry: `node login.js`
- Database: `posts.db`
- Pipeline keys: `work_context`, `rss_review`
- Posting modes: `confirm_email`, `confirm_push`, `auto`

## Required Environment Variables

- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_TO`
- `EMAIL_APPROVAL_SECRET`
- `IMAP_HOST`
- `OPENAI_API_KEY`

Optional but recommended:

- `OPENAI_MODEL`
- `WORK_CONTEXT_URL`
- `REVIEW_RSS_FEED_URL`
- `WEB_PORT`

## Operating Checklist

1. Verify dependencies are installed.
2. Verify `.env` exists and required values are set.
3. Verify login session exists (`auth.json`) or run login refresh.
4. Start scheduler and/or web portal as requested.
5. Validate expected state via logs/API results.
6. Report outcomes and next actions clearly.

## Canonical Commands

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

### Login Refresh

```bash
node login.js
```

### Start Scheduler

```bash
node scheduler.js
```

### Start Web Portal

```bash
npm run web:start
```

### Manual Posting

```bash
node post-now.js
npm run post-now:auto
```

## Pipeline Operations

- Generate work-context content via API: `POST /api/posts/generate` with `{ "pipeline": "work_context" }`
- Generate RSS review content via API: `POST /api/posts/generate` with `{ "pipeline": "rss_review" }`
- Toggle pipelines via API: `PUT /api/pipelines/:key` with `{ "enabled": true|false }`
- Get pipeline states via API: `GET /api/pipelines`

## Safety Rules

- Never run destructive git commands unless explicitly asked.
- Do not expose secrets from `.env` in outputs.
- Prefer read/verify before edit when fixing runtime issues.
- If posting fails, preserve failure evidence and summarize actionable next steps.
