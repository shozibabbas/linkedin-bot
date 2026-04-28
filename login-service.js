const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ipcMain, app } = require("electron");

const authDir = app.isPackaged 
  ? app.getPath("userData") 
  : __dirname;
const AUTH_PATH = path.join(authDir, "auth.json");

function getLoginStatus() {
  try {
    if (!fs.existsSync(AUTH_PATH)) {
      return {
        loggedIn: false,
        exists: false,
        authPath: AUTH_PATH,
        lastUpdated: null,
        fileSizeBytes: 0,
      };
    }

    const stats = fs.statSync(AUTH_PATH);
    return {
      loggedIn: true,
      exists: true,
      authPath: AUTH_PATH,
      lastUpdated: stats.mtime.toISOString(),
      fileSizeBytes: stats.size,
    };
  } catch (error) {
    return {
      loggedIn: false,
      exists: false,
      authPath: AUTH_PATH,
      lastUpdated: null,
      fileSizeBytes: 0,
      error: error.message,
    };
  }
}

function runLoginRefresh() {
  return new Promise((resolve, reject) => {
    const childEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    };

    const child = spawn(process.execPath, [path.join(__dirname, "login.js")], {
      cwd: __dirname,
      env: childEnv,
      stdio: "pipe",
    });

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start login flow: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          success: true,
          status: getLoginStatus(),
          output: stdout.trim(),
        });
        return;
      }

      reject(new Error(`Login flow failed (exit ${code}): ${stderr.trim() || stdout.trim() || "Unknown error"}`));
    });
  });
}

ipcMain.handle("get-login-status", async () => {
  return getLoginStatus();
});

ipcMain.handle("refresh-linkedin-login", async () => {
  return runLoginRefresh();
});

module.exports = {
  getLoginStatus,
  runLoginRefresh,
};
