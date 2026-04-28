const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { chromium } = require("playwright");
const { app } = require("electron");
const { getSetting } = require("./db");

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

async function waitForManualLogin(page) {
  if (!process.stdin.isTTY) {
    await page.waitForTimeout(90000);
    return;
  }

  const rl = readline.createInterface({ input, output });

  console.log("\n[login] A browser window is open for LinkedIn login.");
  console.log("[login] Complete login + 2FA manually.");
  console.log("[login] Press ENTER when done, or wait up to 90 seconds.\n");

  const enterPromise = rl.question("Press ENTER after login is complete...\n");
  const timeoutPromise = page.waitForTimeout(90000);

  try {
    await Promise.race([enterPromise, timeoutPromise]);
  } finally {
    rl.close();
  }
}

async function runLogin() {
  let browser;

  try {
    browser = await chromium.launch({
      headless: false,
      slowMo: 80,
      ...getBrowserLaunchOptions(),
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForManualLogin(page);

    await context.storageState({ path: AUTH_PATH });
    console.log(`[login] Session saved to ${AUTH_PATH}`);
  } catch (error) {
    console.error("[login] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (require.main === module) {
  runLogin();
}
