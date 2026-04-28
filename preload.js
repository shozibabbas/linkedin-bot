const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Login session
  getLoginStatus: () => ipcRenderer.invoke("get-login-status"),
  refreshLinkedinLogin: () => ipcRenderer.invoke("refresh-linkedin-login"),

  // License
  validateLicenseKey: (licenseKey) => ipcRenderer.invoke("validate-license-key", licenseKey),
  activateLicense: (licenseKey) => ipcRenderer.invoke("activate-license", licenseKey),
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (settings) => ipcRenderer.invoke("update-settings", settings),
  getSetupStatus: () => ipcRenderer.invoke("get-setup-status"),
  completeFirstTimeSetup: (payload) => ipcRenderer.invoke("complete-first-time-setup", payload),
  resetFirstTimeSetup: () => ipcRenderer.invoke("reset-first-time-setup"),

  // Runtime installer
  getRuntimeStatus: () => ipcRenderer.invoke("get-runtime-status"),
  installPlaywrightRuntime: (options) => ipcRenderer.invoke("install-playwright-runtime", options),
  pickBrowserExecutable: () => ipcRenderer.invoke("pick-browser-executable"),
  onRuntimeInstallLog: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on("playwright-runtime-install-log", handler);
    return () => ipcRenderer.removeListener("playwright-runtime-install-log", handler);
  },
  
  // Posts
  createPost: (post) => ipcRenderer.invoke("create-post", post),
  getPost: (id) => ipcRenderer.invoke("get-post", id),
  listPosts: (filters) => ipcRenderer.invoke("list-posts", filters),
  updatePost: (id, post) => ipcRenderer.invoke("update-post", id, post),
  deletePost: (id) => ipcRenderer.invoke("delete-post", id),
  generatePostFromUrl: (url, context) => ipcRenderer.invoke("generate-post-from-url", url, context),
  generatePostFromText: (text, context) => ipcRenderer.invoke("generate-post-from-text", text, context),
  postNow: (postId) => ipcRenderer.invoke("post-now", postId),
  scheduleForLater: (postId, scheduledAt) => ipcRenderer.invoke("schedule-for-later", postId, scheduledAt),
  
  // Scheduler
  getSchedulerStatus: () => ipcRenderer.invoke("get-scheduler-status"),
  runSchedulerNow: () => ipcRenderer.invoke("run-scheduler-now"),
  getSchedulerRunPlan: () => ipcRenderer.invoke("get-scheduler-run-plan"),
  generateSchedulerRunDrafts: (payload) => ipcRenderer.invoke("generate-scheduler-run-drafts", payload),
  regenerateSchedulerRunEntry: (payload) => ipcRenderer.invoke("regenerate-scheduler-run-entry", payload),
  executeSchedulerRun: (payload) => ipcRenderer.invoke("execute-scheduler-run", payload),
  onSchedulerRunProgress: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on("scheduler-run-progress", handler);
    return () => ipcRenderer.removeListener("scheduler-run-progress", handler);
  },

  // Auto reactor
  getAutoReactorStatus: () => ipcRenderer.invoke("get-auto-reactor-status"),
  runAutoReactorNow: () => ipcRenderer.invoke("run-auto-reactor-now"),
  stopAutoReactor: () => ipcRenderer.invoke("stop-auto-reactor"),
  
  // Trial
  getTrialStatus: () => ipcRenderer.invoke("get-trial-status"),
  isFreeUser: () => ipcRenderer.invoke("is-free-user"),
});
