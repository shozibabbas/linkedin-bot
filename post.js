const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const dotenv = require("dotenv");
const { chromium } = require("playwright");
const { app } = require("electron");

const { getNextPendingPost, markPosted, markFailed, getSetting } = require("./db");
const { sendPostResultEmail } = require("./email");

dotenv.config();

const execFileAsync = promisify(execFile);

const authDir = app.isPackaged 
  ? app.getPath("userData") 
  : __dirname;
const AUTH_PATH = path.join(authDir, "auth.json");

function getBrowserLaunchOptions() {
  const mode = String(getSetting("playwright_browser_mode", "managed") || "managed").trim();
  const customPath = String(getSetting("playwright_browser_path", "") || "").trim();

  if (mode === "custom" && customPath) {
    return { executablePath: customPath };
  }

  if (mode === "chrome") {
    return { channel: "chrome" };
  }

  if (mode === "msedge") {
    return { channel: "msedge" };
  }

  return {};
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanPause(page, minMs = 500, maxMs = 1500) {
  await page.waitForTimeout(randomBetween(minMs, maxMs));
}

function getScheduledDateTime(minutesAhead = 15, dateInput = null) {
  const target = dateInput ? new Date(dateInput) : new Date(Date.now() + minutesAhead * 60 * 1000);
  if (Number.isNaN(target.getTime())) {
    throw new Error("Invalid schedule date/time provided.");
  }
  target.setSeconds(0, 0);

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  const hh = String(target.getHours()).padStart(2, "0");
  const min = String(target.getMinutes()).padStart(2, "0");

  return {
    dateValue: `${yyyy}-${mm}-${dd}`,
    timeValue: `${hh}:${min}`,
    humanValue: target.toLocaleString(),
    target,
  };
}

function normalizeExplicitScheduleAt(dateInput) {
  if (!dateInput) {
    return null;
  }

  const requested = new Date(dateInput);
  if (Number.isNaN(requested.getTime())) {
    throw new Error("Invalid scheduleAt option provided to posting flow.");
  }

  const now = new Date();
  const diffMinutes = (requested.getTime() - now.getTime()) / 60000;
  if (diffMinutes <= 10) {
    // LinkedIn scheduling can fail for near-immediate timestamps. Push it past 15 minutes.
    const adjusted = new Date(now.getTime() + 16 * 60000);
    adjusted.setSeconds(0, 0);
    return adjusted;
  }

  return requested;
}

function toAppleScriptString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function askViaAppleScript(title, message) {
  const script = `display dialog \"${toAppleScriptString(message)}\" buttons {\"Cancel\", \"Approve\"} default button \"Approve\" with title \"${toAppleScriptString(title)}\"`;

  const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 120000 });
  return /button returned:Approve/i.test(stdout || "");
}

async function askViaBrowserPage(page, heading, details) {
  const approvalPage = await page.context().newPage();

  await approvalPage.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>LinkedIn Bot Approval</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: radial-gradient(circle at 20% 20%, #f4f7ff, #e8edf9);
            color: #1a2333;
          }
          .card {
            width: min(680px, 92vw);
            background: #ffffff;
            border-radius: 14px;
            box-shadow: 0 10px 35px rgba(22, 38, 70, 0.16);
            padding: 24px;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 22px;
          }
          p {
            margin: 0 0 12px;
            line-height: 1.5;
          }
          pre {
            margin: 0;
            padding: 12px;
            border-radius: 8px;
            background: #f3f6fc;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 280px;
            overflow: auto;
          }
          .actions {
            margin-top: 18px;
            display: flex;
            gap: 10px;
          }
          button {
            border: 0;
            border-radius: 9px;
            padding: 11px 16px;
            font-size: 15px;
            cursor: pointer;
          }
          #approve {
            background: #1456c4;
            color: #fff;
          }
          #cancel {
            background: #e7ecf6;
            color: #203152;
          }
        </style>
      </head>
      <body>
        <main class="card">
          <h1 id="heading"></h1>
          <p>Approve to continue or cancel to stop safely.</p>
          <pre id="details"></pre>
          <div class="actions">
            <button id="approve" autofocus>Approve</button>
            <button id="cancel">Cancel</button>
          </div>
        </main>
      </body>
    </html>
  `);

  const decision = await approvalPage.evaluate(
    ({ headingValue, detailsValue }) => {
      document.getElementById("heading").textContent = headingValue;
      document.getElementById("details").textContent = detailsValue;

      return new Promise((resolve) => {
        document.getElementById("approve").addEventListener("click", () => resolve("approve"));
        document.getElementById("cancel").addEventListener("click", () => resolve("cancel"));
      });
    },
    { headingValue: heading, detailsValue: details }
  );

  await approvalPage.close();
  return decision === "approve";
}

async function requestApproval(page, title, details) {

  try {
    return await askViaAppleScript(title, details);
  } catch (error) {
    console.warn("[post] AppleScript approval unavailable. Falling back to browser approval page.");
    return askViaBrowserPage(page, title, details);
  }
}

async function fillDateTime(scheduleDialog, scheduleAt) {
  const dateInputCandidates = [
    scheduleDialog.getByLabel(/date/i).first(),
    scheduleDialog.locator("input[type='date']").first(),
    scheduleDialog.locator("input[name*='date' i]").first(),
  ];

  const timeInputCandidates = [
    scheduleDialog.getByLabel(/time/i).first(),
    scheduleDialog.locator("input[type='time']").first(),
    scheduleDialog.locator("input[name*='time' i]").first(),
  ];

  let dateFilled = false;
  for (const dateInput of dateInputCandidates) {
    if (await dateInput.count()) {
      await dateInput.fill(scheduleAt.dateValue);
      dateFilled = true;
      break;
    }
  }

  let timeFilled = false;
  for (const timeInput of timeInputCandidates) {
    if (await timeInput.count()) {
      await timeInput.fill(scheduleAt.timeValue);
      timeFilled = true;
      break;
    }
  }

  if (!dateFilled || !timeFilled) {
    throw new Error("Could not find schedule date/time inputs in LinkedIn dialog.");
  }
}

async function clickSchedulePost(page, composeDialog) {
  const dialog = composeDialog || page.locator("div[role='dialog']").first();

  // LinkedIn redesigned composer: clock button with aria-label "Schedule post".
  const labeledScheduleButton = dialog.getByRole("button", { name: /^schedule post$/i }).first();
  if (await labeledScheduleButton.count()) {
    await labeledScheduleButton.click();
    return;
  }

  const clockScheduleButton = dialog.locator("button.share-actions__scheduled-post-btn").first();
  if (await clockScheduleButton.count()) {
    await clockScheduleButton.click();
    return;
  }

  const scheduleClockContainerButton = dialog
    .locator(".share-creation-state__schedule-clock-btn button")
    .first();
  if (await scheduleClockContainerButton.count()) {
    await scheduleClockContainerButton.click();
    return;
  }

  const footerScheduleButton = dialog
    .locator(".share-box-footer button[aria-label='Schedule post'], .share-creation-state__footer button[aria-label='Schedule post']")
    .first();
  if (await footerScheduleButton.count()) {
    await footerScheduleButton.click();
    return;
  }

  const directScheduleButton = dialog.getByRole("button", { name: /schedule/i }).first();
  if (await directScheduleButton.count()) {
    await directScheduleButton.click();
    return;
  }

  const optionsButton = dialog.getByRole("button", { name: /post options|more|options/i }).first();
  if (await optionsButton.count()) {
    await optionsButton.click();
    const scheduleMenuItem = page.getByRole("menuitem", { name: /schedule/i }).first();
    await scheduleMenuItem.waitFor({ timeout: 8000 });
    await scheduleMenuItem.click();
    return;
  }

  // Last resort: try global schedule control if compose dialog has shifted.
  const globalScheduleButton = page.locator("button[aria-label='Schedule post']").first();
  if (await globalScheduleButton.count()) {
    await globalScheduleButton.click();
    return;
  }

  throw new Error("Could not find LinkedIn schedule controls in composer.");
}

async function ensureComposerHasContent(page, composeDialog, expectedContent, options = {}) {
  const activeDialog = composeDialog || (await waitForComposerDialog(page));
  const editor = await getComposerEditor(activeDialog);
  const currentText = (await editor.innerText()).trim();
  if (currentText.length > 0) {
    return;
  }

  await editor.click();
  if (!options.fastMode) {
    await humanPause(page, 400, 900);
  }
  await page.keyboard.type(expectedContent, { delay: options.fastMode ? 0 : randomBetween(15, 45) });
}

async function waitForComposerDialog(page, timeoutMs = 20000) {
  const dialogCandidates = [
    page
      .locator("div[role='dialog'][data-test-modal]")
      .filter({ has: page.locator(".share-box") })
      .last(),
    page.locator("div.share-box-v2__modal").last(),
    page
      .locator("div[role='dialog'].artdeco-modal")
      .filter({ has: page.locator(".share-box") })
      .last(),
    page
      .locator("div[role='dialog']")
      .filter({ has: page.locator(".ql-editor[contenteditable='true'], #share-post__scheduled-date, #share-to-linkedin-modal__header") })
      .last(),
    page.locator("div[role='dialog']").last(),
  ];

  const perCandidateTimeout = Math.max(2500, Math.floor(timeoutMs / dialogCandidates.length));

  for (const dialog of dialogCandidates) {
    try {
      await dialog.waitFor({ timeout: perCandidateTimeout, state: "visible" });
    } catch (_error) {
      continue;
    }

    const hasShareBox = await dialog.locator(".share-box").count();
    const hasHeader = await dialog.locator("#share-to-linkedin-modal__header").count();
    const hasDismiss = await dialog.locator("button[aria-label='Dismiss']").count();
    if (hasShareBox || hasHeader || hasDismiss) {
      return dialog;
    }
  }

  throw new Error("Could not detect LinkedIn composer dialog after clicking Start a post.");
}

async function openComposerFromFeed(page) {
  const startPostCandidates = [
    page.locator("[componentkey='draft-text-replaceable-component']").first(),
    page.locator("div[componentkey='draft-text-replaceable-component'] p", { hasText: /start a post/i }).first(),
    page.locator("[componentkey='draft-text-replaceable-component'] p").first(),
    page.getByRole("button", { name: /start a post/i }).first(),
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const candidate of startPostCandidates) {
      if (!(await candidate.count())) {
        continue;
      }

      try {
        await candidate.waitFor({ timeout: 5000, state: "visible" });
        await candidate.scrollIntoViewIfNeeded();
        await candidate.click();
      } catch (_error) {
        try {
          await candidate.click({ force: true });
        } catch (_forceError) {
          continue;
        }
      }

      await humanPause(page, 500, 1100);
      try {
        return await waitForComposerDialog(page, 9000);
      } catch (_dialogError) {
        // Click did not open dialog; try next candidate.
      }
    }

    // On subsequent attempts, jump back to top of feed before retrying trigger clicks.
    await page.keyboard.press("Home").catch(() => {});
    await humanPause(page, 500, 900);
  }

  throw new Error("Could not detect LinkedIn composer dialog after clicking Start a post.");
}

async function getComposerEditor(composeDialog) {
  const candidates = [
    composeDialog.locator(".ql-editor[contenteditable='true']").first(),
    composeDialog.locator("div[role='textbox']").first(),
    composeDialog.getByRole("textbox", { name: /text editor for creating content|what do you want to talk about/i }).first(),
    composeDialog.locator("[data-test-ql-editor-contenteditable='true']").first(),
  ];

  for (const candidate of candidates) {
    if (!(await candidate.count())) {
      continue;
    }

    try {
      await candidate.waitFor({ timeout: 6000, state: "visible" });
      return candidate;
    } catch (_error) {
      // Try next candidate.
    }
  }

  throw new Error("Could not find LinkedIn post editor after opening composer.");
}

async function schedulePostForLater(page, post, composeDialog, scheduleAtInput = null, options = {}) {
  const scheduleAt = getScheduledDateTime(15, scheduleAtInput);

  await clickSchedulePost(page, composeDialog);
  await humanPause(page, 500, 1200);

  const scheduleDialog = page.locator("div[role='dialog']").last();
  await scheduleDialog.waitFor({ timeout: 15000 });
  await scheduleDialog.getByRole("heading", { name: /schedule post/i }).first().waitFor({ timeout: 15000 });

  // Handle LinkedIn's current schedule modal IDs first, then generic fallbacks.
  const dateInputById = scheduleDialog.locator("#share-post__scheduled-date").first();
  const timeInputById = scheduleDialog.locator("#share-post__scheduled-time").first();

  if ((await dateInputById.count()) && (await timeInputById.count())) {
    // LinkedIn expects mm/dd/yyyy in this variant.
    const target = scheduleAt.target;
    const dateText = `${String(target.getMonth() + 1).padStart(2, "0")}/${String(target.getDate()).padStart(2, "0")}/${target.getFullYear()}`;
    const timeText = `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;

    await dateInputById.fill(dateText);
    await timeInputById.fill(timeText);
    await timeInputById.press("Tab");
  } else {
    await fillDateTime(scheduleDialog, scheduleAt);
  }

  await humanPause(page, 500, 1000);

  // Click the "Next" button in the schedule date/time modal and verify the step actually advances.
  const nextButtonCandidates = [
    scheduleDialog.locator("button[aria-label='Next']").first(),
    scheduleDialog.locator("button.share-box-footer__primary-btn").first(),
    scheduleDialog.getByRole("button", { name: /^next$/i }).first(),
  ];

  let nextClicked = false;
  for (const nextButton of nextButtonCandidates) {
    if (!(await nextButton.count())) {
      continue;
    }

    try {
      await nextButton.waitFor({ timeout: 4000, state: "visible" });
      if (await nextButton.isDisabled()) {
        continue;
      }
      await nextButton.scrollIntoViewIfNeeded();
      await humanPause(page, 300, 600);
      await nextButton.click();
      nextClicked = true;
      break;
    } catch (_error) {
      try {
        await nextButton.click({ force: true });
        nextClicked = true;
        break;
      } catch (_forceError) {
        // Try next candidate.
      }
    }
  }

  if (!nextClicked) {
    throw new Error("Could not click LinkedIn Next button in schedule dialog.");
  }

  await humanPause(page, 900, 1600);

  let advancedPastScheduleStep = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const scheduleHeadingVisible = await scheduleDialog.getByRole("heading", { name: /schedule post/i }).first().isVisible().catch(() => false);
    const scheduleDateStillVisible = await scheduleDialog.locator("#share-post__scheduled-date").first().isVisible().catch(() => false);
    const primaryScheduleButtonVisible = await page
      .locator("div[role='dialog'] button.share-actions__primary-action")
      .filter({ hasText: /^\s*Schedule\s*$/i })
      .first()
      .isVisible()
      .catch(() => false);

    if ((!scheduleHeadingVisible && !scheduleDateStillVisible) || primaryScheduleButtonVisible) {
      advancedPastScheduleStep = true;
      break;
    }

    await humanPause(page, 300, 600);
  }

  if (!advancedPastScheduleStep) {
    throw new Error("LinkedIn schedule dialog did not advance after clicking Next.");
  }

  // After Next, LinkedIn returns to the main composer view. Enter the body here,
  // because the scheduled date/time step can wipe previously entered content.
  const composerDialogAfterNext = await waitForComposerDialog(page);
  await ensureComposerHasContent(page, composerDialogAfterNext, post.content, options);

  let scheduleBtn = composerDialogAfterNext
    .locator(".share-creation-state__footer button.share-actions__primary-action, .share-box-footer button.share-actions__primary-action")
    .filter({ hasText: /^\s*Schedule\s*$/i })
    .first();

  if (!(await scheduleBtn.count())) {
    scheduleBtn = composerDialogAfterNext
      .locator("button.share-actions__primary-action")
      .filter({ hasText: /^\s*Schedule\s*$/i })
      .first();
  }

  if (!(await scheduleBtn.count())) {
    scheduleBtn = composerDialogAfterNext.getByRole("button", { name: /^schedule$/i }).first();
  }

  await scheduleBtn.waitFor({ timeout: 15000, state: "visible" });

  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await scheduleBtn.isDisabled())) {
      break;
    }
    await humanPause(page, 300, 600);
  }

  await humanPause(page, 900, 1600);
  if (await scheduleBtn.isDisabled()) {
    throw new Error("Schedule button is disabled after schedule setup. Check if post content is present.");
  }
  await scheduleBtn.click();

  await page.waitForTimeout(randomBetween(2500, 4500));
  console.log(`[post] Post #${post.id} scheduled for ${scheduleAt.humanValue}.`);
}

async function runPostingFlow(postInput, options = {}) {
  const post = postInput || getNextPendingPost();
  const skipApproval = Boolean(options.skipApproval);
  const sendResultEmail = options.sendResultEmail !== false;
  const fastMode = Boolean(options.fastMode);
  const explicitScheduleAt = normalizeExplicitScheduleAt(options.scheduleAt || null);
  const scheduleLabel = explicitScheduleAt ? getScheduledDateTime(15, explicitScheduleAt).humanValue : "15 minutes later";
  const maxAttempts = 3;

  if (!post) {
    console.log("[post] No pending posts found.");
    return { ok: false, reason: "no-pending-post" };
  }

  if (!fs.existsSync(AUTH_PATH)) {
    const authErr = "auth.json not found. Run login.js first to save LinkedIn session.";
    markFailed(post.id, authErr);
    if (sendResultEmail) {
      await sendPostResultEmail({ post, status: "failed", error: authErr });
    }
    throw new Error(authErr);
  }

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = 4000 + attempt * 2000;
      console.log(`[post] Waiting ${delay / 1000}s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      console.log(`[post] Retrying post #${post.id} (attempt ${attempt}/${maxAttempts})...`);
    }

    let browser;
    try {
      browser = await chromium.launch({
        headless: false,
        slowMo: fastMode ? 0 : randomBetween(60, 120),
        ...getBrowserLaunchOptions(),
      });
      const context = await browser.newContext({ storageState: AUTH_PATH });
      const page = await context.newPage();

      console.log(`\n[post] Preparing LinkedIn post #${post.id} (attempt ${attempt}/${maxAttempts})`);
      console.log("[post] Navigating to feed...");
      await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 60000 });

      if (!fastMode) {
        await humanPause(page, 1200, 2200);
      }

      if (/linkedin\.com\/login/i.test(page.url())) {
        throw new Error("LinkedIn session expired. Please run login.js again.");
      }

      console.log("\n--- Pending LinkedIn Post ---");
      console.log(post.content);
      console.log("-----------------------------\n");

      if (!skipApproval) {
        const approvedToCompose = await requestApproval(
          page,
          "LinkedIn Bot: Open Composer",
          `Post #${post.id}\n\n${post.content.slice(0, 1000)}`
        );
        if (!approvedToCompose) {
          throw new Error("User canceled before opening composer.");
        }
      } else {
        console.log(`[post] Email approval detected for post #${post.id}. Skipping local compose confirmation.`);
      }

      const composeDialog = await openComposerFromFeed(page);

      if (!skipApproval) {
        const approvedToSchedule = await requestApproval(
          page,
          "LinkedIn Bot: Schedule Post",
          `Schedule post #${post.id} for ${scheduleLabel}?\n\n${post.content.slice(0, 1000)}`
        );
        if (!approvedToSchedule) {
          throw new Error("User canceled before scheduling.");
        }
      } else {
        console.log(`[post] Approval bypass enabled for post #${post.id}. Skipping local scheduling confirmation.`);
      }

      await schedulePostForLater(page, post, composeDialog, explicitScheduleAt, { fastMode });
      markPosted(post.id);

      console.log(`[post] Post #${post.id} submitted to LinkedIn scheduler successfully.`);
      if (sendResultEmail) {
        await sendPostResultEmail({ post, status: "posted" });
      }

      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastError = errorMessage;
      console.error(`[post] Attempt ${attempt}/${maxAttempts} failed for post #${post.id}: ${errorMessage}`);

      // Non-retriable: user explicitly canceled or session/auth issues
      if (/user canceled|session expired/i.test(errorMessage)) {
        console.log("[post] Non-retriable error — aborting retries.");
        break;
      }

      if (attempt < maxAttempts) {
        console.log(`[post] Will retry (${maxAttempts - attempt} attempt(s) remaining).`);
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // All attempts exhausted (or non-retriable error)
  markFailed(post.id, lastError);
  console.error(`[post] Post #${post.id} permanently failed after ${maxAttempts} attempt(s).`);
  if (sendResultEmail) {
    await sendPostResultEmail({ post, status: "failed", error: lastError });
  }
  return { ok: false, reason: lastError };
}

module.exports = {
  runPostingFlow,
};
