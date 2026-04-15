# LinkedIn Human-in-the-Loop CLI (macOS)

A minimal but production-quality Node.js CLI utility that queues LinkedIn posts in SQLite, checks every 3 hours, notifies you on macOS, and schedules posts after manual confirmation in a visible Playwright browser.

## Features

- Local queue of LinkedIn posts in SQLite (`better-sqlite3`)
- 3-hour scheduler (`node-cron`)
- macOS notification trigger (`node-notifier`)
- Human-in-the-loop posting flow (`playwright`, non-headless only)
- Session persistence via `auth.json`
- Success/failure email alerts (`nodemailer`)
- Safe failure handling with DB error logging

## 1) Install

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Fill `.env` with:

- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_TO`
- `EMAIL_APPROVAL_SECRET`
- `IMAP_HOST`

Optional inbox settings:

- `IMAP_USER` (defaults to `EMAIL_USER`)
- `IMAP_PASS` (defaults to `EMAIL_PASS`)
- `IMAP_PORT` (defaults to `993`)
- `IMAP_SECURE` (defaults to `true`)

## 2) Save LinkedIn Login Session

```bash
node login.js
```

What it does:

- Opens Chromium in visible mode
- Takes you to LinkedIn login
- Waits for manual login / 2FA (up to 90 seconds, or press ENTER when done)
- Saves session to `auth.json`

## 3) Add Posts to Queue

```bash
node add-post.js "My LinkedIn content"
```

If no argument is provided, you can type content interactively in the terminal.

## 4) Start Scheduler (every 3 hours)

```bash
node scheduler.js
```

Behavior:

- Runs an immediate check on startup
- Then runs at minute `0` every 3 hours
- If a pending post exists, sends a macOS notification with a preview
- Also sends an approval email containing the pending post content
- Polls the inbox every minute for approval replies

## 5) Email Approval Flow

When the scheduler finds a pending post:

1. It sends you an email containing the post content.
2. To approve it remotely, reply in the same email thread.
3. Include the exact value of `EMAIL_APPROVAL_SECRET` somewhere in the reply body.
4. The scheduler polls your inbox.
5. When it finds a matching reply, it automatically runs the posting flow on your machine without local confirmation dialogs.

Notes:

- Reply matching is thread-based using the original approval email.
- The reply must contain the exact secret string.
- The system only auto-runs for posts still in `pending` status.

## 6) Notification + Posting Flow

When notification appears:

1. Click the notification.
2. Browser opens in non-headless mode.
3. Saved LinkedIn session is loaded from `auth.json`.
4. Post content is shown in terminal.
5. Approve a GUI confirmation dialog to open composer.
6. Approve a second GUI confirmation dialog to schedule it for 15 minutes later.

Safety guarantees:

- Never auto-posts without explicit GUI confirmation
- Schedules post for 15 minutes ahead (so you can still edit/review on LinkedIn)
- Uses random small delays to mimic human pacing
- Marks DB state as `posted` or `failed`
- Sends success/failure email

## 7) Manual Trigger (Immediate)

```bash
node post-now.js
```

This fetches the next pending post and runs the same human-confirmation posting flow.

Manual auto-approved flow (no email approval step, no local confirmation dialogs):

```bash
npm run post-now:auto
```

This runs the same posting/scheduling logic with approvals pre-approved and result email disabled.

## 8) Web Admin UI (React CRUD)

Start the local admin UI and API server:

```bash
npm run web:start
```

What it does:

- Builds the React app
- Starts a local Express server on a stable port (`60396` by default)
- Serves a CRUD UI for the same `posts.db` database used by the scheduler

The server is available at:

```bash
http://localhost:60396
```

Because `/etc/hosts` includes `linkedin-bot.local`, the same UI is also reachable as:

```bash
http://linkedin-bot.local:60396
```

Important:

- Override the default with `WEB_PORT` in `.env` if needed.
- The web UI supports create, read, update, and delete operations for LinkedIn posts.
- The React app and API are served by the same Node process.

## SQLite Schema

Database file: `posts.db`

Table: `posts`

- `id` INTEGER PRIMARY KEY
- `content` TEXT
- `status` TEXT (`pending`, `posted`, `failed`)
- `posted_at` DATETIME
- `error` TEXT

## macOS Background Setup

### Option A (simple)

Run in a terminal session:

```bash
node scheduler.js
```

### Option B (recommended): Launch Agent

1. Create LaunchAgents folder if needed:

```bash
mkdir -p ~/Library/LaunchAgents
```

2. Create file `~/Library/LaunchAgents/com.yourname.linkedin-bot.plist` with this content (edit paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yourname.linkedin-bot</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/your-user/Projects/linkedin-bot/launch-agent-entry.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/your-user/Projects/linkedin-bot</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/linkedin-bot.out.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/linkedin-bot.err.log</string>
</dict>
</plist>
```

This entrypoint starts both the scheduler and the web admin server in a single LaunchAgent process.

3. Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.yourname.linkedin-bot.plist
```

4. Start now:

```bash
launchctl start com.yourname.linkedin-bot
```

5. Verify:

```bash
launchctl list | grep linkedin-bot
```

6. Stop/unload:

```bash
launchctl unload ~/Library/LaunchAgents/com.yourname.linkedin-bot.plist
```

## Operational Notes

- Keep `auth.json` private and re-run `node login.js` if session expires.
- Approvals are GUI-based: first via AppleScript dialog, with an in-browser approval page as fallback.
- Email approvals can bypass local GUI prompts after a valid reply containing `EMAIL_APPROVAL_SECRET` is received in the same email thread.
- If no GUI session is available, posting will fail safely and mark the post as failed.
- LinkedIn UI may change over time; selectors are role/text based but may need updates if the UI changes significantly.
