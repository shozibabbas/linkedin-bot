const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, ipcMain } = require("electron");
const { chromium } = require("playwright");
const axios = require("axios");

const { getSetting, setSetting } = require("./db");
const { settingsService } = require("./settings-service");

const authDir = app.isPackaged ? app.getPath("userData") : __dirname;
const AUTH_PATH = path.join(authDir, "auth.json");

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDailyCommentsMap(rawValue) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
        .map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
    );
  } catch (_error) {
    return {};
  }
}

function parseSeenPostHashes(rawValue) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(String(rawValue));
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const now = Date.now();
    const maxAgeMs = 1000 * 60 * 60 * 24 * 30;

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([hash, ts]) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash) && Number.isFinite(Number(ts)))
        .filter(([, ts]) => now - Number(ts) <= maxAgeMs)
    );
  } catch (_error) {
    return {};
  }
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function clampPostText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

const NON_POST_FEED_PATTERNS = [
  /^recommended for you\b/i,
  /^promoted\b/i,
  /^sponsored\b/i,
  /^suggested for you\b/i,
  /^because you follow\b/i,
  /^add to your feed\b/i,
  /^today'?s games\b/i,
  /^puzzles for you\b/i,
  /^people you may know\b/i,
  /^follow more creators\b/i,
];

// Job-related or wide-reach signals that warrant a CFBR comment.
const CFBR_JOB_PATTERNS = [
  /\b(we'?re?\s+hiring|now\s+hiring|we\s+are\s+hiring|actively\s+hiring)\b/i,
  /\b(job\s+opening|job\s+opportunity|open\s+position|open\s+role|new\s+role|new\s+opening)\b/i,
  /\b(looking\s+to\s+hire|looking\s+for\s+a|recruiting|vacancy|vacancies)\b/i,
  /\b(apply\s+now|apply\s+here|send\s+(your\s+)?(cv|resume)|dm\s+(me\s+)?your\s+(cv|resume))\b/i,
  /\b(join\s+our\s+team|join\s+us|career\s+opportunity|career\s+opening)\b/i,
  /\b(full[- ]time|part[- ]time|contract\s+role|remote\s+role|hybrid\s+role)\b/i,
];

const CFBR_REACH_PATTERNS = [
  /\b(please\s+(share|repost|re-post)|spread\s+the\s+word|help\s+(me\s+)?reach|share\s+this|repost\s+if)\b/i,
  /\b(let'?s\s+get\s+this\s+out|comment\s+to\s+help\s+(me\s+)?reach|drop\s+a\s+comment\s+below)\b/i,
];

function shouldCommentCfbr(postText) {
  const text = String(postText || "");
  return (
    CFBR_JOB_PATTERNS.some((re) => re.test(text)) ||
    CFBR_REACH_PATTERNS.some((re) => re.test(text))
  );
}

function looksLikeNonPostModule(cardText) {
  const text = String(cardText || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return true;
  }

  const leadingText = text.slice(0, 220);
  return NON_POST_FEED_PATTERNS.some((pattern) => pattern.test(leadingText));
}

class AutoCommenterService {
  constructor() {
    this.running = false;
    this.stopRequested = false;
    this.commentsDone = 0;
    this.lastRunAt = null;
    this.lastStopReason = "";
    this.runPromise = null;
    this.page = null;
    this.browser = null;
    this.context = null;
  }

  getSettings() {
    return settingsService.getAutoCommenterSettings();
  }

  getStatus() {
    const cfg = this.getSettings();
    const totalComments = Math.max(0, Number(getSetting("auto_commenter_total_comments", "0")) || 0);
    const commentsTrend7d = this.getCommentsTrend(7);

    return {
      enabled: cfg.enabled,
      autoRun: cfg.autoRun,
      feedUrl: cfg.feedUrl,
      commentsPerRun: cfg.commentsPerRun,
      unlimited: cfg.unlimited,
      running: this.running,
      commentsDone: this.commentsDone,
      totalComments,
      commentsTrend7d,
      lastRunAt: this.lastRunAt,
      lastStopReason: this.lastStopReason,
    };
  }

  getCommentsTrend(days = 7) {
    const map = parseDailyCommentsMap(getSetting("auto_commenter_comments_daily", "{}"));
    const rows = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      rows.push({
        key,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count: map[key] || 0,
      });
    }

    return rows;
  }

  incrementCommentCounters(amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const currentTotal = Math.max(0, Number(getSetting("auto_commenter_total_comments", "0")) || 0);
    setSetting("auto_commenter_total_comments", String(currentTotal + amount));

    const map = parseDailyCommentsMap(getSetting("auto_commenter_comments_daily", "{}"));
    const key = todayKey();
    map[key] = (map[key] || 0) + amount;

    const sortedKeys = Object.keys(map).sort();
    const keep = new Set(sortedKeys.slice(-45));
    const compacted = {};
    for (const k of sortedKeys) {
      if (keep.has(k)) {
        compacted[k] = map[k];
      }
    }

    setSetting("auto_commenter_comments_daily", JSON.stringify(compacted));
  }

  markPostHashAsCommented(hash) {
    if (!hash) {
      return;
    }

    const map = parseSeenPostHashes(getSetting("auto_commenter_seen_post_hashes", "{}"));
    map[hash] = Date.now();

    const entries = Object.entries(map)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .slice(-600);

    setSetting("auto_commenter_seen_post_hashes", JSON.stringify(Object.fromEntries(entries)));
  }

  hasCommentedPostHash(hash) {
    if (!hash) {
      return false;
    }

    const map = parseSeenPostHashes(getSetting("auto_commenter_seen_post_hashes", "{}"));
    return Object.prototype.hasOwnProperty.call(map, hash);
  }

  async stop(reason = "Stopped") {
    this.stopRequested = true;
    this.lastStopReason = reason;

    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close({ runBeforeUnload: true });
      }
    } catch (_error) {
      // ignore close errors
    }

    try {
      if (this.context) {
        await this.context.close();
      }
    } catch (_error) {
      // ignore close errors
    }

    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (_error) {
      // ignore close errors
    }

    this.page = null;
    this.context = null;
    this.browser = null;
    this.running = false;
  }

  async ensureAuthExists() {
    if (!fs.existsSync(AUTH_PATH)) {
      throw new Error("LinkedIn session not found. Refresh login in Settings > Account first.");
    }
  }

  async keepPageInteractive(page) {
    const viewport = page.viewportSize() || { width: 1280, height: 800 };
    const x = randomBetween(80, Math.max(100, viewport.width - 80));
    const y = randomBetween(120, Math.max(140, viewport.height - 120));

    await page.mouse.move(x, y, { steps: randomBetween(6, 14) });
    await page.locator("body").first().hover({ force: true });
    await sleep(randomBetween(120, 320));
  }

  async humanScroll(page) {
    await this.keepPageInteractive(page);

    await page.mouse.wheel(0, randomBetween(1000, 1800));
    await sleep(randomBetween(700, 1400));

    if (Math.random() < 0.65) {
      await page.keyboard.press("PageDown");
    }
    if (Math.random() < 0.45) {
      await page.evaluate(() => {
        window.scrollBy({ top: Math.floor(window.innerHeight * 0.55), left: 0, behavior: "auto" });
      });
    }

    await sleep(randomBetween(1500, 3200));
  }

  async extractPostText(postCard) {
    const textCandidates = [
      postCard.locator('[data-testid="expandable-text-box"]').first(),
      postCard.locator("p").first(),
    ];

    for (const candidate of textCandidates) {
      try {
        const text = clampPostText(await candidate.innerText({ timeout: 1200 }));
        if (text.length >= 40) {
          return text;
        }
      } catch (_error) {
        // Try the next selector.
      }
    }

    try {
      return clampPostText(await postCard.innerText({ timeout: 2000 }));
    } catch (_error) {
      return "";
    }
  }

  async isCommentableFeedPost(postCard, cachedText = "") {
    const cardText = cachedText || (await this.extractPostText(postCard));
    if (cardText.length < 40) {
      return false;
    }

    if (looksLikeNonPostModule(cardText)) {
      return false;
    }

    const explicitSkipSelectors = [
      'span:has-text("Promoted")',
      'span:has-text("Sponsored")',
      'h2:has-text("Recommended for you")',
      'span:has-text("Recommended for you")',
      'h2:has-text("Add to your feed")',
      'span:has-text("Add to your feed")',
    ];

    for (const selector of explicitSkipSelectors) {
      try {
        if ((await postCard.locator(selector).count()) > 0) {
          return false;
        }
      } catch (_error) {
        // Ignore selector issues and continue evaluating the card.
      }
    }

    try {
      if ((await postCard.locator('button:has(span:has-text("Comment"))').count()) === 0) {
        return false;
      }
    } catch (_error) {
      return false;
    }

    return true;
  }

  async openCommentEditor(postCard) {
    const commentTrigger = postCard.locator('button:has(span:has-text("Comment"))').first();
    if ((await commentTrigger.count()) === 0) {
      return null;
    }

    await commentTrigger.scrollIntoViewIfNeeded();
    await sleep(randomBetween(200, 520));
    await commentTrigger.click({ timeout: 7000 });

    const editor = postCard.locator('div[contenteditable="true"][aria-label*="comment"]').last();
    await editor.waitFor({ state: "visible", timeout: 7000 });
    return editor;
  }

  async submitComment(postCard, commentText) {
    const editor = await this.openCommentEditor(postCard);
    if (!editor) {
      return false;
    }

    await editor.click({ timeout: 5000 });
    await editor.fill(commentText);
    await sleep(randomBetween(300, 650));

    const submitButton = postCard.locator('div[componentkey*="commentButtonSection"] button').first();
    if ((await submitButton.count()) > 0) {
      await submitButton.click({ timeout: 7000 });
      return true;
    }

    await editor.press("Enter");
    return true;
  }

  async generateComment(postText) {
    const openaiKey = getSetting("openai_api_key");
    if (!openaiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const cfg = this.getSettings();
    const customInstructions = String(cfg.commentInstructions || "").trim();

    const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const prompt = `You are writing a concise LinkedIn comment.

Write one short, natural comment reacting to this post.
Rules:
- 1 sentence only
- 8 to 20 words
- No emojis
- No hashtags
- No sales language
- Friendly and professional
${customInstructions ? `\nAdditional instructions:\n${customInstructions}` : ""}

Post text:
${postText}`;

    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: openaiModel,
          messages: [
            { role: "system", content: "You write high-quality, human LinkedIn comments." },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 80,
        },
        {
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const content = response?.data?.choices?.[0]?.message?.content;
      const cleaned = String(content || "").replace(/\s+/g, " ").trim();
      if (!cleaned) {
        throw new Error("Unexpected OpenAI response format");
      }
      return cleaned.slice(0, 240);
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        throw new Error(`OpenAI Error: ${error.response.data.error.message}`);
      }
      throw new Error(`Failed to generate comment: ${error.message}`);
    }
  }

  async tryCommentOnePost(postCard) {
    const postText = await this.extractPostText(postCard);
    if (!(await this.isCommentableFeedPost(postCard, postText))) {
      return false;
    }

    const postHash = hashText(postText);
    if (this.hasCommentedPostHash(postHash)) {
      return false;
    }

    const cfg = this.getSettings();
    let comment;
    if (cfg.cfbrEnabled && shouldCommentCfbr(postText)) {
      comment = "CFBR";
    } else {
      comment = await this.generateComment(postText);
    }

    const submitted = await this.submitComment(postCard, comment);
    if (!submitted) {
      return false;
    }

    this.markPostHashAsCommented(postHash);
    return true;
  }

  async runSession() {
    const cfg = this.getSettings();
    const feedUrl = String(cfg.feedUrl || "https://www.linkedin.com/feed/").trim();
    const target = Math.max(1, Number(cfg.commentsPerRun) || 10);
    const unlimited = Boolean(cfg.unlimited);

    await this.ensureAuthExists();

    this.stopRequested = false;
    this.running = true;
    this.commentsDone = 0;
    this.lastRunAt = new Date().toISOString();
    this.lastStopReason = "";

    const launchOptions = {
      headless: false,
      args: [
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
      ],
      ...getBrowserLaunchOptions(),
    };

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({ storageState: AUTH_PATH });
    this.page = await this.context.newPage();

    this.page.on("close", () => {
      this.stopRequested = true;
      this.lastStopReason = this.lastStopReason || "Window closed by user";
    });

    await this.page.goto(feedUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.keepPageInteractive(this.page);
    await sleep(randomBetween(1800, 3200));

    let idleRounds = 0;
    let nextCardIndex = 0;

    while (!this.stopRequested) {
      if (!unlimited && this.commentsDone >= target) {
        this.lastStopReason = `Target reached (${target})`;
        break;
      }

      let commentedInRound = 0;
      const cards = this.page.locator('div[role="listitem"]');
      const count = await cards.count();

      for (let i = nextCardIndex; i < count; i++) {
        if (this.stopRequested) {
          break;
        }

        if (!unlimited && this.commentsDone >= target) {
          this.lastStopReason = `Target reached (${target})`;
          break;
        }

        nextCardIndex = i + 1;
        const card = cards.nth(i);

        try {
          const visible = await card.isVisible();
          if (!visible) {
            continue;
          }

          await card.scrollIntoViewIfNeeded();
          await sleep(randomBetween(280, 720));

          const commented = await this.tryCommentOnePost(card);
          if (!commented) {
            continue;
          }

          this.commentsDone += 1;
          this.incrementCommentCounters(1);
          commentedInRound += 1;

          await sleep(randomBetween(1400, 3200));
          if (this.commentsDone % 4 === 0) {
            await sleep(randomBetween(3800, 7400));
          }
        } catch (_error) {
          // Keep moving through feed cards; this run is best-effort.
        }
      }

      if (this.stopRequested) {
        break;
      }

      const cardsBeforeScroll = count;
      await this.humanScroll(this.page);
      const cardsAfterScroll = await cards.count();

      if (cardsAfterScroll > cardsBeforeScroll) {
        idleRounds = 0;
      } else if (commentedInRound === 0) {
        idleRounds += 1;
      } else {
        idleRounds = 0;
      }

      if (!unlimited && idleRounds >= 12) {
        this.lastStopReason = "No new comment targets found after multiple scroll attempts";
        break;
      }
    }

    await this.stop(this.lastStopReason || "Completed");

    return {
      ok: true,
      commentsDone: this.commentsDone,
      stopReason: this.lastStopReason || "Completed",
    };
  }

  startInBackground() {
    if (this.running || this.runPromise) {
      return {
        ok: false,
        commentsDone: this.commentsDone,
        reason: "Auto commenter is already running",
      };
    }

    if (!fs.existsSync(AUTH_PATH)) {
      return {
        ok: false,
        reason: "LinkedIn session not found. Refresh login in Settings > Account first.",
      };
    }

    this.runPromise = this.runSession()
      .catch(async (error) => {
        await this.stop("Failed");
        this.lastStopReason = error.message;
      })
      .finally(() => {
        this.runPromise = null;
      });

    return {
      ok: true,
      started: true,
    };
  }

  startAutoRunIfEnabled() {
    const cfg = this.getSettings();
    if (!cfg.enabled || !cfg.autoRun || this.running) {
      return;
    }

    this.startInBackground();
    this.runPromise?.catch((error) => {
      this.lastStopReason = error.message;
      this.running = false;
    });
  }
}

const autoCommenterService = new AutoCommenterService();

ipcMain.handle("get-auto-commenter-status", async () => autoCommenterService.getStatus());

ipcMain.handle("run-auto-commenter-now", async () => autoCommenterService.startInBackground());

ipcMain.handle("stop-auto-commenter", async () => {
  await autoCommenterService.stop("Stopped manually");
  return autoCommenterService.getStatus();
});

module.exports = {
  autoCommenterService,
};
