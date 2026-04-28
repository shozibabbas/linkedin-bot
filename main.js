const { app, BrowserWindow } = require("electron");
const path = require("path");
const isDev = process.env.NODE_ENV === "development";
const isCaptureMode = process.env.CAPTURE_MODE === "1";

process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(app.getPath("userData"), "playwright-browsers");

// Load and initialize services
require("./license");
require("./login-service");
require("./settings-service");
require("./playwright-runtime-service");
require("./posts-service");
require("./scheduler-service");
require("./auto-reactor-service");
require("./auto-commenter-service");

const { schedulerService } = require("./scheduler-service");
const { autoReactorService } = require("./auto-reactor-service");
const { autoCommenterService } = require("./auto-commenter-service");

let mainWindow;
const APP_ICON_PATH = path.join(__dirname, "assets", "icon.png");

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const startUrl = `file://${path.join(__dirname, "dist/index.html")}`;
  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.on("ready", () => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(APP_ICON_PATH);
  }

  createWindow();

  if (!isCaptureMode) {
    schedulerService.startScheduler();
    autoReactorService.startAutoRunIfEnabled();
    autoCommenterService.startAutoRunIfEnabled();
  }
});

app.on("window-all-closed", () => {
  // Stop scheduler before quitting
  schedulerService.stopScheduler();
  autoReactorService.stop("Window closed").catch(() => {});
  autoCommenterService.stop("Window closed").catch(() => {});
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("will-quit", () => {
  schedulerService.stopScheduler();
  autoReactorService.stop("App quit").catch(() => {});
  autoCommenterService.stop("App quit").catch(() => {});
});
