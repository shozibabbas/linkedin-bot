const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, dialog, ipcMain } = require("electron");
const { chromium } = require("playwright");
const { getSetting } = require("./db");

function getPlaywrightCliPath() {
  const packageJsonPath = require.resolve("playwright/package.json");
  const cliPath = path.join(path.dirname(packageJsonPath), "cli.js");
  const unpackedCliPath = cliPath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);

  if (fs.existsSync(unpackedCliPath)) {
    return unpackedCliPath;
  }

  if (!fs.existsSync(cliPath)) {
    throw new Error(`Playwright CLI not found at expected paths: ${cliPath} or ${unpackedCliPath}`);
  }

  return cliPath;
}

function getInstallerWorkingDirectory() {
  const userData = app.getPath("userData");
  if (fs.existsSync(userData) && fs.statSync(userData).isDirectory()) {
    return userData;
  }

  return process.cwd();
}

function getBrowsersPath() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(app.getPath("userData"), "playwright-browsers");
}

function getPlaywrightEnv() {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PLAYWRIGHT_BROWSERS_PATH: getBrowsersPath(),
  };
}

function getBrowserMode() {
  const mode = String(getSetting("playwright_browser_mode", "managed") || "managed").trim();
  const allowed = new Set(["managed", "chrome", "msedge", "custom"]);
  return allowed.has(mode) ? mode : "managed";
}

function getBrowserPath() {
  return String(getSetting("playwright_browser_path", "") || "").trim();
}

function getRuntimeStatus() {
  const browserMode = getBrowserMode();
  const browserPath = getBrowserPath();

  const status = {
    browserMode,
    browserPath,
    browsersPath: getBrowsersPath(),
    managedExecutablePath: "",
    runtimeInstalled: false,
    browserReady: false,
    details: "",
  };

  if (browserMode === "custom") {
    status.browserReady = Boolean(browserPath) && fs.existsSync(browserPath);
    status.runtimeInstalled = status.browserReady;
    status.details = status.browserReady
      ? "Custom browser executable detected"
      : "Select a valid browser executable path";
    return status;
  }

  if (browserMode === "chrome" || browserMode === "msedge") {
    status.browserReady = true;
    status.runtimeInstalled = true;
    status.details = "Using system browser channel";
    return status;
  }

  const executablePath = chromium.executablePath();
  status.managedExecutablePath = executablePath;
  const exists = Boolean(executablePath) && fs.existsSync(executablePath);
  status.runtimeInstalled = exists;
  status.browserReady = exists;
  status.details = exists
    ? "Managed Playwright Chromium is installed"
    : "Managed Playwright Chromium is not installed";

  return status;
}

function removeManagedRuntimeArtifacts(sender) {
  const browsersPath = getBrowsersPath();

  sender.send("playwright-runtime-install-log", {
    stream: "system",
    text: `[installer] Reinstall mode enabled. Cleaning existing runtime at ${browsersPath}\n`,
  });

  if (!fs.existsSync(browsersPath)) {
    sender.send("playwright-runtime-install-log", {
      stream: "system",
      text: "[installer] No existing managed runtime found.\n",
    });
    return;
  }

  fs.rmSync(browsersPath, { recursive: true, force: true });
  sender.send("playwright-runtime-install-log", {
    stream: "system",
    text: "[installer] Existing managed runtime removed.\n",
  });
}

function installManagedRuntime(sender, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (options.reinstall !== false) {
        removeManagedRuntimeArtifacts(sender);
      }
    } catch (error) {
      reject(new Error(`Failed to clean existing runtime: ${error.message}`));
      return;
    }

    let cliPath;
    try {
      cliPath = getPlaywrightCliPath();
    } catch (error) {
      reject(new Error(`Unable to locate Playwright CLI: ${error.message}`));
      return;
    }

    const args = [cliPath, "install", "chromium"];
    const workingDirectory = getInstallerWorkingDirectory();

    if (!fs.existsSync(getBrowsersPath())) {
      fs.mkdirSync(getBrowsersPath(), { recursive: true });
    }

    sender.send("playwright-runtime-install-log", {
      stream: "system",
      text: `[installer] Running: node ${path.basename(cliPath)} install chromium${options.withDeps && process.platform === "linux" ? " --with-deps" : ""} (cwd: ${workingDirectory})\n`,
    });

    if (options.withDeps && process.platform === "linux") {
      args.push("--with-deps");
    }

    const child = spawn(process.execPath, args, {
      cwd: workingDirectory,
      env: getPlaywrightEnv(),
      stdio: "pipe",
    });

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "");
      stdout += text;
      sender.send("playwright-runtime-install-log", { stream: "stdout", text });
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      stderr += text;
      sender.send("playwright-runtime-install-log", { stream: "stderr", text });
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to install Playwright runtime: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        sender.send("playwright-runtime-install-log", {
          stream: "system",
          text: "\n[installer] Managed runtime installation completed.\n",
        });
        resolve({
          success: true,
          output: stdout.trim(),
          status: getRuntimeStatus(),
        });
        return;
      }

      sender.send("playwright-runtime-install-log", {
        stream: "system",
        text: `\n[installer] Managed runtime installation failed (exit ${code}).\n`,
      });

      reject(new Error(`Playwright install failed (exit ${code}): ${stderr.trim() || stdout.trim() || "Unknown error"}`));
    });
  });
}

async function pickBrowserExecutable() {
  const result = await dialog.showOpenDialog({
    title: "Select Browser Executable",
    properties: ["openFile"],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return { canceled: true, path: "" };
  }

  return {
    canceled: false,
    path: result.filePaths[0],
  };
}

ipcMain.handle("get-runtime-status", async () => {
  return getRuntimeStatus();
});

ipcMain.handle("install-playwright-runtime", async (event, options = {}) => {
  return installManagedRuntime(event.sender, options);
});

ipcMain.handle("pick-browser-executable", async () => {
  return pickBrowserExecutable();
});

module.exports = {
  getRuntimeStatus,
  installManagedRuntime,
};
