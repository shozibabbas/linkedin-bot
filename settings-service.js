const { ipcMain } = require("electron");
const { getSetting, setSetting } = require("./db");

class SettingsService {
  getSetupStatus() {
    return {
      completed: this.parseBoolean(getSetting("first_time_setup_complete", "false")),
    };
  }

  markSetupCompleted(completed = true) {
    setSetting("first_time_setup_complete", completed ? "true" : "false");
  }

  // OpenAI API Key
  getOpenaiKey() {
    return getSetting("openai_api_key") || "";
  }

  setOpenaiKey(key) {
    if (!key || !String(key).trim()) {
      throw new Error("OpenAI API key cannot be empty");
    }
    setSetting("openai_api_key", String(key).trim());
  }

  validateOpenaiKey(key) {
    // Basic validation: should start with sk- and be reasonable length
    if (!key || !String(key).trim().startsWith("sk-")) {
      return false;
    }
    return String(key).trim().length > 20;
  }

  // Generation Settings
  getGenerationSettings() {
    return {
      maxPostWords: Math.max(50, Math.min(500, this.parseNumber(getSetting("generation_max_post_words", "150"), 150))),
    };
  }

  updateGenerationSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "maxPostWords")) {
      const count = Math.max(50, Math.min(500, Math.floor(Number(settings.maxPostWords) || 150)));
      setSetting("generation_max_post_words", String(count));
    }
  }

  // Additional generation instructions
  static get DEFAULT_GENERATION_INSTRUCTIONS() {
    return `Write like a real human being, not a robot. Avoid hyphens in the middle of sentences. Use natural, flowing language that sounds like how a thoughtful person actually speaks. Keep sentences varied in length. The post should end with a line that naturally invites the reader to share their perspective or start a conversation — something like a genuine question or a low-friction opening for them to reply. Do not use bullet points or em-dashes as structural devices.`;
  }

  getGenerationInstructions() {
    const stored = String(getSetting("generation_instructions", "") || "").trim();
    return stored || SettingsService.DEFAULT_GENERATION_INSTRUCTIONS;
  }

  updateGenerationInstructions(instructions) {
    setSetting("generation_instructions", String(instructions || "").trim());
  }

  // Generation profile context settings
  getGenerationProfileSettings() {
    return {
      designation: String(getSetting("generation_profile_designation", "") || "").trim(),
      company: String(getSetting("generation_profile_company", "") || "").trim(),
      includeDesignation: this.parseBoolean(getSetting("generation_profile_include_designation", "false")),
      includeCompany: this.parseBoolean(getSetting("generation_profile_include_company", "false")),
    };
  }

  updateGenerationProfileSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "designation")) {
      setSetting("generation_profile_designation", String(settings.designation || "").trim());
    }

    if (Object.prototype.hasOwnProperty.call(settings, "company")) {
      setSetting("generation_profile_company", String(settings.company || "").trim());
    }

    if (Object.prototype.hasOwnProperty.call(settings, "includeDesignation")) {
      setSetting("generation_profile_include_designation", settings.includeDesignation ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "includeCompany")) {
      setSetting("generation_profile_include_company", settings.includeCompany ? "true" : "false");
    }
  }

  // Scheduler Settings
  getSchedulerSettings() {
    return {
      enabled: this.parseBoolean(getSetting("scheduler_enabled", "true")),
      startTime: getSetting("scheduler_start_time", "09:00"), // 9 AM
      endTime: getSetting("scheduler_end_time", "23:59"), // 11:59 PM
      postsPerDay: this.parseNumber(getSetting("scheduler_posts_per_day", "3")),
      autoRun: this.parseBoolean(getSetting("scheduler_auto_run", "true")),
    };
  }

  updateSchedulerSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "enabled")) {
      setSetting("scheduler_enabled", settings.enabled ? "true" : "false");
    }
    if (Object.prototype.hasOwnProperty.call(settings, "startTime")) {
      this.validateTimeFormat(settings.startTime);
      setSetting("scheduler_start_time", settings.startTime);
    }
    if (Object.prototype.hasOwnProperty.call(settings, "endTime")) {
      this.validateTimeFormat(settings.endTime);
      setSetting("scheduler_end_time", settings.endTime);
    }
    if (Object.prototype.hasOwnProperty.call(settings, "postsPerDay")) {
      const count = Math.max(1, Math.min(10, Math.floor(Number(settings.postsPerDay) || 1)));
      setSetting("scheduler_posts_per_day", String(count));
    }
    if (Object.prototype.hasOwnProperty.call(settings, "autoRun")) {
      setSetting("scheduler_auto_run", settings.autoRun ? "true" : "false");
    }
  }

  // Auto reactor settings
  getAutoReactorSettings() {
    return {
      enabled: this.parseBoolean(getSetting("auto_reactor_enabled", "false")),
      autoRun: this.parseBoolean(getSetting("auto_reactor_auto_run", "false")),
      feedUrl: String(getSetting("auto_reactor_feed_url", "https://www.linkedin.com/feed/") || "https://www.linkedin.com/feed/").trim(),
      likesPerRun: Math.max(1, Math.min(500, this.parseNumber(getSetting("auto_reactor_likes_per_run", "20"), 20))),
      unlimited: this.parseBoolean(getSetting("auto_reactor_unlimited", "false")),
    };
  }

  updateAutoReactorSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "enabled")) {
      setSetting("auto_reactor_enabled", settings.enabled ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "autoRun")) {
      setSetting("auto_reactor_auto_run", settings.autoRun ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "feedUrl")) {
      const nextUrl = String(settings.feedUrl || "https://www.linkedin.com/feed/").trim();
      if (!/^https:\/\//i.test(nextUrl)) {
        throw new Error("Auto reactor feed URL must be a valid https URL");
      }
      setSetting("auto_reactor_feed_url", nextUrl);
    }

    if (Object.prototype.hasOwnProperty.call(settings, "likesPerRun")) {
      const count = Math.max(1, Math.min(500, Math.floor(Number(settings.likesPerRun) || 20)));
      setSetting("auto_reactor_likes_per_run", String(count));
    }

    if (Object.prototype.hasOwnProperty.call(settings, "unlimited")) {
      setSetting("auto_reactor_unlimited", settings.unlimited ? "true" : "false");
    }
  }

  // Auto commenter settings
  getAutoCommenterSettings() {
    const defaultInstructions = "Write as a senior software engineer. Be specific and add genuine value. Reference a detail from the post. Never be generic. Sound like a real person, not a bot.";
    return {
      enabled: this.parseBoolean(getSetting("auto_commenter_enabled", "false")),
      autoRun: this.parseBoolean(getSetting("auto_commenter_auto_run", "false")),
      feedUrl: String(getSetting("auto_commenter_feed_url", "https://www.linkedin.com/feed/") || "https://www.linkedin.com/feed/").trim(),
      commentsPerRun: Math.max(1, Math.min(300, this.parseNumber(getSetting("auto_commenter_comments_per_run", "10"), 10))),
      unlimited: this.parseBoolean(getSetting("auto_commenter_unlimited", "false")),
      cfbrEnabled: this.parseBoolean(getSetting("auto_commenter_cfbr_enabled", "true")),
      commentInstructions: String(getSetting("auto_commenter_comment_instructions", defaultInstructions) || defaultInstructions).trim(),
    };
  }

  updateAutoCommenterSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "enabled")) {
      setSetting("auto_commenter_enabled", settings.enabled ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "autoRun")) {
      setSetting("auto_commenter_auto_run", settings.autoRun ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "feedUrl")) {
      const nextUrl = String(settings.feedUrl || "https://www.linkedin.com/feed/").trim();
      if (!/^https:\/\//i.test(nextUrl)) {
        throw new Error("Auto commenter feed URL must be a valid https URL");
      }
      setSetting("auto_commenter_feed_url", nextUrl);
    }

    if (Object.prototype.hasOwnProperty.call(settings, "commentsPerRun")) {
      const count = Math.max(1, Math.min(300, Math.floor(Number(settings.commentsPerRun) || 10)));
      setSetting("auto_commenter_comments_per_run", String(count));
    }

    if (Object.prototype.hasOwnProperty.call(settings, "unlimited")) {
      setSetting("auto_commenter_unlimited", settings.unlimited ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "cfbrEnabled")) {
      setSetting("auto_commenter_cfbr_enabled", settings.cfbrEnabled ? "true" : "false");
    }

    if (Object.prototype.hasOwnProperty.call(settings, "commentInstructions")) {
      setSetting("auto_commenter_comment_instructions", String(settings.commentInstructions || "").trim());
    }
  }

  // Work Context (URLs and text to cycle through)
  normalizeWorkContexts(contexts) {
    if (!Array.isArray(contexts)) {
      return [];
    }

    return contexts
      .map((ctx) => ({
        type: ctx.type === "url" ? "url" : "text",
        value: String(ctx.value || "").trim(),
        prompt: String(ctx.prompt || "").trim(),
      }))
      .filter((ctx) => ctx.value);
  }

  getWorkContexts() {
    const contextsJson = getSetting("work_contexts", "[]");
    try {
      const parsed = JSON.parse(contextsJson);
      return this.normalizeWorkContexts(parsed);
    } catch {
      return [];
    }
  }

  updateWorkContexts(contexts) {
    if (!Array.isArray(contexts)) {
      throw new Error("Work contexts must be an array");
    }

    // Validate and normalize
    const validated = this.normalizeWorkContexts(contexts);

    setSetting("work_contexts", JSON.stringify(validated));
  }

  // Attribution post settings
  getAttributionSettings() {
    return {
      enabled: this.parseBoolean(getSetting("attribution_enabled", "true")),
      dailyTime: getSetting("attribution_time", "14:00"), // 2 PM
    };
  }

  updateAttributionSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "enabled")) {
      setSetting("attribution_enabled", settings.enabled ? "true" : "false");
    }
    if (Object.prototype.hasOwnProperty.call(settings, "dailyTime")) {
      this.validateTimeFormat(settings.dailyTime);
      setSetting("attribution_time", settings.dailyTime);
    }
  }

  // Playwright runtime/browser settings
  getPlaywrightSettings() {
    const browserMode = getSetting("playwright_browser_mode", "managed");
    const allowed = new Set(["managed", "chrome", "msedge", "custom"]);

    return {
      browserMode: allowed.has(browserMode) ? browserMode : "managed",
      browserPath: getSetting("playwright_browser_path", ""),
    };
  }

  updatePlaywrightSettings(settings) {
    if (Object.prototype.hasOwnProperty.call(settings, "browserMode")) {
      const mode = String(settings.browserMode || "managed").trim();
      const allowed = new Set(["managed", "chrome", "msedge", "custom"]);
      if (!allowed.has(mode)) {
        throw new Error("Invalid Playwright browser mode");
      }
      setSetting("playwright_browser_mode", mode);
    }

    if (Object.prototype.hasOwnProperty.call(settings, "browserPath")) {
      setSetting("playwright_browser_path", String(settings.browserPath || "").trim());
    }
  }

  // Get all settings
  getAllSettings() {
    return {
      setup: this.getSetupStatus(),
      openaiKey: this.getOpenaiKey() ? "***" : "", // Hide key
      generation: this.getGenerationSettings(),
      generationInstructions: this.getGenerationInstructions(),
      generationProfile: this.getGenerationProfileSettings(),
      scheduler: this.getSchedulerSettings(),
      autoReactor: this.getAutoReactorSettings(),
      autoCommenter: this.getAutoCommenterSettings(),
      workContexts: this.getWorkContexts(),
      attribution: this.getAttributionSettings(),
      playwright: this.getPlaywrightSettings(),
    };
  }

  // Helper methods
  parseBoolean(value, defaultValue = false) {
    if (typeof value === "boolean") return value;
    if (String(value).toLowerCase() === "true") return true;
    if (String(value).toLowerCase() === "false") return false;
    return defaultValue;
  }

  parseNumber(value, defaultValue = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : defaultValue;
  }

  validateTimeFormat(time) {
    const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!regex.test(time)) {
      throw new Error("Invalid time format. Use HH:MM");
    }
  }
}

const settingsService = new SettingsService();

// IPC Handlers
ipcMain.handle("get-settings", async (event) => {
  try {
    return settingsService.getAllSettings();
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("update-settings", async (event, settings) => {
  try {
    if (settings.openaiKey) {
      if (!settingsService.validateOpenaiKey(settings.openaiKey)) {
        throw new Error("Invalid OpenAI API key format");
      }
      settingsService.setOpenaiKey(settings.openaiKey);
    }

    if (settings.scheduler) {
      settingsService.updateSchedulerSettings(settings.scheduler);
    }

    if (settings.autoReactor) {
      settingsService.updateAutoReactorSettings(settings.autoReactor);
    }

    if (settings.autoCommenter) {
      settingsService.updateAutoCommenterSettings(settings.autoCommenter);
    }

    if (settings.generation) {
      settingsService.updateGenerationSettings(settings.generation);
    }

    if (settings.generationProfile) {
      settingsService.updateGenerationProfileSettings(settings.generationProfile);
    }

    if (Object.prototype.hasOwnProperty.call(settings, "generationInstructions")) {
      settingsService.updateGenerationInstructions(settings.generationInstructions);
    }

    if (settings.workContexts) {
      settingsService.updateWorkContexts(settings.workContexts);
    }

    if (settings.attribution) {
      settingsService.updateAttributionSettings(settings.attribution);
    }

    if (settings.playwright) {
      settingsService.updatePlaywrightSettings(settings.playwright);
    }

    return { success: true };
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("get-setup-status", async () => {
  try {
    return settingsService.getSetupStatus();
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("complete-first-time-setup", async (event, setupPayload = {}) => {
  try {
    if (setupPayload.openaiKey && !settingsService.validateOpenaiKey(setupPayload.openaiKey)) {
      throw new Error("Invalid OpenAI API key format");
    }

    if (setupPayload.openaiKey) {
      settingsService.setOpenaiKey(setupPayload.openaiKey);
    }

    if (setupPayload.scheduler) {
      settingsService.updateSchedulerSettings(setupPayload.scheduler);
    }

    if (setupPayload.autoReactor) {
      settingsService.updateAutoReactorSettings(setupPayload.autoReactor);
    }

    if (setupPayload.autoCommenter) {
      settingsService.updateAutoCommenterSettings(setupPayload.autoCommenter);
    }

    if (setupPayload.generation) {
      settingsService.updateGenerationSettings(setupPayload.generation);
    }

    if (setupPayload.generationProfile) {
      settingsService.updateGenerationProfileSettings(setupPayload.generationProfile);
    }

    if (Object.prototype.hasOwnProperty.call(setupPayload, "generationInstructions")) {
      settingsService.updateGenerationInstructions(setupPayload.generationInstructions);
    }

    if (setupPayload.workContexts) {
      settingsService.updateWorkContexts(setupPayload.workContexts);
    }

    if (setupPayload.attribution) {
      settingsService.updateAttributionSettings(setupPayload.attribution);
    }

    if (setupPayload.playwright) {
      settingsService.updatePlaywrightSettings(setupPayload.playwright);
    }

    settingsService.markSetupCompleted(true);

    return { success: true, setup: settingsService.getSetupStatus() };
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("reset-first-time-setup", async () => {
  try {
    settingsService.markSetupCompleted(false);
    return { success: true, setup: settingsService.getSetupStatus() };
  } catch (error) {
    throw new Error(error.message);
  }
});

module.exports = {
  settingsService,
};
