const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain } = require("electron");
const { chromium } = require("playwright");

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

function parseDailyReactsMap(rawValue) {
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

class AutoReactorService {
  constructor() {
    this.running = false;
    this.stopRequested = false;
    this.likesDone = 0;
    this.lastRunAt = null;
    this.lastStopReason = "";
    this.runPromise = null;
    this.page = null;
    this.browser = null;
    this.context = null;
  }

  getSettings() {
    return settingsService.getAutoReactorSettings();
  }

  getStatus() {
    const cfg = this.getSettings();
    const totalReacts = Math.max(0, Number(getSetting("auto_reactor_total_reacts", "0")) || 0);
    const reactsTrend7d = this.getReactsTrend(7);

    return {
      enabled: cfg.enabled,
      autoRun: cfg.autoRun,
      feedUrl: cfg.feedUrl,
      likesPerRun: cfg.likesPerRun,
      unlimited: cfg.unlimited,
      running: this.running,
      likesDone: this.likesDone,
      totalReacts,
      reactsTrend7d,
      lastRunAt: this.lastRunAt,
      lastStopReason: this.lastStopReason,
    };
  }

  getReactsTrend(days = 7) {
    const map = parseDailyReactsMap(getSetting("auto_reactor_reacts_daily", "{}"));
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

  incrementReactionCounters(amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const currentTotal = Math.max(0, Number(getSetting("auto_reactor_total_reacts", "0")) || 0);
    setSetting("auto_reactor_total_reacts", String(currentTotal + amount));

    const map = parseDailyReactsMap(getSetting("auto_reactor_reacts_daily", "{}"));
    const key = todayKey();
    map[key] = (map[key] || 0) + amount;

    // Keep recent history compact.
    const sortedKeys = Object.keys(map).sort();
    const keep = new Set(sortedKeys.slice(-45));
    const compacted = {};
    for (const k of sortedKeys) {
      if (keep.has(k)) {
        compacted[k] = map[k];
      }
    }

    setSetting("auto_reactor_reacts_daily", JSON.stringify(compacted));
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

    // LinkedIn feed hydration can pause unless pointer activity exists.
    await page.mouse.move(x, y, { steps: randomBetween(6, 14) });
    await page.locator("body").first().hover({ force: true });
    await sleep(randomBetween(120, 320));
  }

  async humanScroll(page) {
    await this.keepPageInteractive(page);

    await page.mouse.wheel(0, randomBetween(1000, 1800));
    await sleep(randomBetween(700, 1400));

    // Mix wheel + keyboard + JS scroll for more reliable lazy loading.
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

  async clickFirstUnreactedButton(page) {
    await this.keepPageInteractive(page);

    const buttons = page.locator('button[aria-label*="Reaction button state: no reaction"]');
    const count = await buttons.count();
    if (!count) {
      return false;
    }

    const limit = Math.min(count, 8);
    let target = null;

    for (let i = 0; i < limit; i++) {
      const candidate = buttons.nth(i);
      try {
        const visible = await candidate.isVisible();
        if (visible) {
          target = candidate;
          break;
        }
      } catch (_error) {
        // ignore detached node race; keep scanning
      }
    }

    if (!target) {
      target = buttons.first();
    }

    await target.scrollIntoViewIfNeeded();
    await sleep(randomBetween(280, 760));
    await target.hover({ force: true });
    await sleep(randomBetween(120, 340));
    await target.click({ timeout: 7000 });
    return true;
  }

  async runSession() {
    const cfg = this.getSettings();
    const feedUrl = String(cfg.feedUrl || "https://www.linkedin.com/feed/").trim();
    const target = Math.max(1, Number(cfg.likesPerRun) || 20);
    const unlimited = Boolean(cfg.unlimited);

    await this.ensureAuthExists();

    this.stopRequested = false;
    this.running = true;
    this.likesDone = 0;
    this.lastRunAt = new Date().toISOString();
    this.lastStopReason = "";

    const launchOptions = {
      headless: false,
      args: [
        // Keep automation responsive while window is minimized/occluded without stealing focus.
        "--disable-backgrounding-occluded-windows",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
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

    while (!this.stopRequested) {
      if (!unlimited && this.likesDone >= target) {
        this.lastStopReason = `Target reached (${target})`;
        break;
      }

      let reactedInThisRound = 0;
      let scanAttempts = 0;

      while (!this.stopRequested) {
        if (!unlimited && this.likesDone >= target) {
          this.lastStopReason = `Target reached (${target})`;
          break;
        }

        if (scanAttempts >= 30) {
          break;
        }

        let clicked = false;
        try {
          clicked = await this.clickFirstUnreactedButton(this.page);
        } catch (_error) {
          clicked = false;
        }

        if (!clicked) {
          break;
        }

        this.likesDone += 1;
        this.incrementReactionCounters(1);
        reactedInThisRound += 1;
        scanAttempts += 1;

        // Human-paced interaction pattern with occasional longer pauses.
        await sleep(randomBetween(1100, 3200));
        if (this.likesDone % 5 === 0) {
          await sleep(randomBetween(3800, 8200));
        }
      }

      if (this.stopRequested) {
        break;
      }

      if (reactedInThisRound === 0) {
        idleRounds += 1;
      } else {
        idleRounds = 0;
      }

      await this.humanScroll(this.page);

      // Keep scrolling and trying. For non-unlimited runs, stop after prolonged no-new-like rounds.
      if (!unlimited && idleRounds >= 12) {
        this.lastStopReason = "No more unliked posts found after multiple scroll attempts";
        break;
      }
    }

    await this.stop(this.lastStopReason || "Completed");

    return {
      ok: true,
      likesDone: this.likesDone,
      stopReason: this.lastStopReason || "Completed",
    };
  }

  startInBackground() {
    if (this.running || this.runPromise) {
      return {
        ok: false,
        likesDone: this.likesDone,
        reason: "Auto reactor is already running",
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

    // Fire-and-forget; status is available through IPC.
    this.startInBackground();
    this.runPromise?.catch((error) => {
      this.lastStopReason = error.message;
      this.running = false;
    });
  }
}

const autoReactorService = new AutoReactorService();

ipcMain.handle("get-auto-reactor-status", async () => autoReactorService.getStatus());

ipcMain.handle("run-auto-reactor-now", async () => autoReactorService.startInBackground());

ipcMain.handle("stop-auto-reactor", async () => {
  await autoReactorService.stop("Stopped manually");
  return autoReactorService.getStatus();
});

module.exports = {
  autoReactorService,
};