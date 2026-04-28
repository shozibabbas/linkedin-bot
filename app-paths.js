const path = require("node:path");

function getElectronApp() {
  try {
    const { app } = require("electron");
    return app && typeof app.getPath === "function" ? app : null;
  } catch {
    return null;
  }
}

function getWritableAppDirectory(fallbackDir = __dirname) {
  const injectedUserData = String(process.env.LINKEDIN_BOT_USER_DATA || "").trim();
  if (injectedUserData) {
    return injectedUserData;
  }

  const electronApp = getElectronApp();
  if (electronApp) {
    try {
      if (electronApp.isPackaged) {
        return electronApp.getPath("userData");
      }
    } catch {
      // Fall back to the caller-provided directory when Electron app paths are unavailable.
    }
  }

  return path.resolve(fallbackDir);
}

module.exports = {
  getWritableAppDirectory,
};