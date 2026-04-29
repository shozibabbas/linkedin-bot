const { ipcMain } = require("electron");
const cron = require("node-cron");
const { listScheduledPostsV2, createPostV2, markPostV2AsPosted, markPostV2AsFailed, getSetting, setSetting } = require("./db");
const { generatePostContent, generateAttributionPostContent } = require("./posts-service");
const { settingsService } = require("./settings-service");
const { licenseManager } = require("./license");
const { runPostingFlow } = require("./post");

function parseTimeToToday(timeValue) {
  const [hour, minute] = String(timeValue || "00:00")
    .split(":")
    .map((value) => Number(value));
  const date = new Date();
  date.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
  return date;
}

function clampFutureSchedule(dateInput) {
  const requested = new Date(dateInput);
  if (Number.isNaN(requested.getTime())) {
    const fallback = new Date(Date.now() + 20 * 60000);
    fallback.setSeconds(0, 0);
    return fallback;
  }

  const minAllowed = new Date(Date.now() + 11 * 60000);
  if (requested < minAllowed) {
    minAllowed.setSeconds(0, 0);
    return minAllowed;
  }
  return requested;
}

function toRunEntryId(index) {
  return `entry-${Date.now()}-${index}-${Math.floor(Math.random() * 9999)}`;
}

const SCHEDULER_ARRANGEMENT_KEY = "scheduler_saved_arrangement_v1";

function toTimeOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseXmlTag(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function parseRssFeedItems(xml) {
  const items = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const entryPattern = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;

  let match;
  while ((match = itemPattern.exec(String(xml || ""))) && items.length < 60) {
    const itemXml = match[1];
    const title = parseXmlTag(itemXml, "title");
    const link = parseXmlTag(itemXml, "link");
    const description = parseXmlTag(itemXml, "description") || parseXmlTag(itemXml, "content:encoded");
    if (title && link) {
      items.push({ title, link, description });
    }
  }

  while ((match = entryPattern.exec(String(xml || ""))) && items.length < 60) {
    const entryXml = match[1];
    const title = parseXmlTag(entryXml, "title");
    const summary = parseXmlTag(entryXml, "summary") || parseXmlTag(entryXml, "content");
    const hrefMatch = String(entryXml).match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    const link = hrefMatch ? String(hrefMatch[1]).trim() : parseXmlTag(entryXml, "link");
    if (title && link) {
      items.push({ title, link, description: summary });
    }
  }

  return items;
}

class SchedulerService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
  }

  async fetchUrlBody(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "linkedin-bot/1.0 (+scheduler)",
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL ${url}. HTTP ${response.status}`);
    }

    return {
      body: await response.text(),
      contentType: response.headers.get("content-type") || "",
    };
  }

  async generateFromUrlContext(url, usedFeedLinks = new Set(), promptHint = "") {
    const { body, contentType } = await this.fetchUrlBody(url);
    const likelyXml = /xml|rss|atom/i.test(contentType) || /<rss\b|<feed\b|<item\b|<entry\b/i.test(body);

    if (likelyXml) {
      const items = parseRssFeedItems(body);
      if (items.length) {
        const availableItems = items.filter((item) => !usedFeedLinks.has(item.link));
        const itemPool = availableItems.length ? availableItems : items;
        const chosen = itemPool[Math.floor(Math.random() * itemPool.length)];
        usedFeedLinks.add(chosen.link);

        let linkedContent = "";
        try {
          const linked = await this.fetchUrlBody(chosen.link);
          linkedContent = stripHtml(linked.body).slice(0, 6000);
        } catch (_error) {
          linkedContent = "";
        }

        const combinedContext = [
          `Feed URL: ${url}`,
          `Selected Item Title: ${chosen.title}`,
          `Selected Item Link: ${chosen.link}`,
          `Selected Item Summary: ${chosen.description || "(none)"}`,
          "",
          "Item content snapshot:",
          linkedContent || "(Could not fetch linked article body)",
        ].join("\n");

        const baseHint = "Write a LinkedIn post based on this RSS item and linked article context.";
        const finalHint = promptHint ? `${baseHint} ${promptHint}` : baseHint;
        return generatePostContent(combinedContext, finalHint);
      }
    }

    const plainContext = stripHtml(body).slice(0, 7000);
    const baseHint = "Write a LinkedIn post based on this URL context.";
    const finalHint = promptHint ? `${baseHint} ${promptHint}` : baseHint;
    return generatePostContent(plainContext, finalHint);
  }

  // Check if we should add attribution post (free tier, day 8+)
  shouldAddAttributionPost() {
    if (!licenseManager.isFreeUser()) {
      return false; // Paid users don't get attribution
    }

    const trialStatus = licenseManager.getTrialStatus();
    return !trialStatus.inTrial; // After day 7
  }

  // Get today's day key (YYYY-MM-DD)
  getTodayKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  getSavedArrangementEntries() {
    const raw = getSetting(SCHEDULER_ARRANGEMENT_KEY, "[]");
    try {
      const parsed = JSON.parse(String(raw || "[]"));
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry, index) => {
          const type = entry?.type === "attribution" ? "attribution" : "generated";
          const timeOfDay = String(entry?.timeOfDay || "").trim();
          const sourceType = entry?.source?.type === "url" ? "url" : "text";
          const sourceValue = String(entry?.source?.value || "").trim();
          const sourcePrompt = String(entry?.source?.prompt || "").trim();
          const customPrompt = String(entry?.customPrompt || "").trim();

          if (!timeOfDay || !/^([0-1]?\d|2[0-3]):[0-5]\d$/.test(timeOfDay)) {
            return null;
          }

          if (type !== "attribution" && !sourceValue) {
            return null;
          }

          return {
            id: `saved-entry-${index + 1}`,
            type,
            timeOfDay,
            source: type === "attribution"
              ? null
              : {
                  type: sourceType,
                  value: sourceValue,
                  prompt: sourcePrompt,
                },
            customPrompt,
          };
        })
        .filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  saveArrangementEntries(entries = []) {
    if (!Array.isArray(entries)) {
      return;
    }

    const normalized = entries
      .map((entry) => {
        const type = entry?.type === "attribution" ? "attribution" : "generated";
        const timeOfDay = toTimeOfDay(entry?.scheduledAt);
        if (!timeOfDay) {
          return null;
        }

        if (type === "attribution") {
          return {
            type,
            timeOfDay,
            source: null,
            customPrompt: "",
          };
        }

        const sourceType = entry?.source?.type === "url" ? "url" : "text";
        const sourceValue = String(entry?.source?.value || "").trim();
        if (!sourceValue) {
          return null;
        }

        return {
          type,
          timeOfDay,
          source: {
            type: sourceType,
            value: sourceValue,
            prompt: String(entry?.source?.prompt || "").trim(),
          },
          customPrompt: String(entry?.customPrompt || "").trim(),
        };
      })
      .filter(Boolean);

    if (normalized.length) {
      setSetting(SCHEDULER_ARRANGEMENT_KEY, JSON.stringify(normalized));
    }
  }

  // Calculate time slots for the day
  calculateTimeSlots(startTime, endTime, postCount) {
    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);

    const startDate = new Date();
    startDate.setHours(startHour, startMin, 0, 0);

    const endDate = new Date();
    endDate.setHours(endHour, endMin, 59, 999);

    const totalMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    const intervalMinutes = Math.max(1, Math.floor(totalMinutes / postCount));

    const slots = [];
    for (let i = 0; i < postCount; i++) {
      const slotMinutes = startDate.getTime() + i * intervalMinutes * 60 * 1000;
      // Add random jitter (±5 minutes)
      const jitter = (Math.random() - 0.5) * 10 * 60 * 1000;
      slots.push(new Date(slotMinutes + jitter));
    }

    return slots;
  }

  // Get next context to use (cycle through contexts)
  getNextContext() {
    const contexts = settingsService.getWorkContexts();
    if (contexts.length === 0) {
      return null;
    }

    const index = Math.floor(Math.random() * contexts.length);
    return contexts[index];
  }

  // Generate posts for the day
  async generateDailyPosts(postCount) {
    const posts = [];
    const usedFeedLinks = new Set();

    for (let i = 0; i < postCount; i++) {
      try {
        const context = this.getNextContext();
        if (!context) {
          console.warn("No work context available, skipping post generation");
          continue;
        }

        let generatedContent;
        if (context.type === "url") {
          generatedContent = await this.generateFromUrlContext(context.value, usedFeedLinks, context.prompt || "");
        } else {
          // Generate from text context
          generatedContent = await generatePostContent(context.value, context.prompt || "");
        }

        posts.push({
          content: generatedContent,
          type: "generated",
        });
      } catch (error) {
        console.error(`Failed to generate post ${i + 1}:`, error.message);
      }
    }

    return posts;
  }

  getRunConstraints() {
    const licenseStatus = licenseManager.getLicenseStatus();
    const trialStatus = licenseManager.getTrialStatus();
    const inTrial = Boolean(trialStatus?.inTrial);
    const isLicensed = Boolean(licenseStatus?.licensed);

    if (isLicensed) {
      return {
        mode: "licensed",
        maxPosts: 10,
        maxContextSources: 100,
        attributionRequired: false,
      };
    }

    if (inTrial) {
      return {
        mode: "trial",
        maxPosts: 10,
        maxContextSources: 100,
        attributionRequired: false,
      };
    }

    return {
      mode: "free",
      maxPosts: 2,
      maxContextSources: 1,
      attributionRequired: true,
    };
  }

  buildDefaultRunPlan() {
    const scheduler = settingsService.getSchedulerSettings();
    const attribution = settingsService.getAttributionSettings();
    const contexts = settingsService.getWorkContexts();
    const constraints = this.getRunConstraints();
    const savedArrangement = this.getSavedArrangementEntries();

    if (!contexts.length && !savedArrangement.some((entry) => entry.type !== "attribution")) {
      throw new Error("No work context sources are configured. Add at least one source in Settings.");
    }

    const eligibleContexts = contexts.slice(0, constraints.maxContextSources);
    const entries = [];
    const requestedCount = Math.max(1, Math.min(Number(scheduler.postsPerDay) || 1, constraints.maxPosts));
    const savedGenerated = savedArrangement.filter((entry) => entry.type !== "attribution").slice(0, requestedCount);

    if (savedGenerated.length) {
      for (let index = 0; index < savedGenerated.length; index++) {
        const saved = savedGenerated[index];
        const fallbackSource = eligibleContexts.length
          ? eligibleContexts[index % eligibleContexts.length]
          : { type: "text", value: "", prompt: "" };
        const sourceValue = String(saved?.source?.value || "").trim();
        const source = sourceValue
          ? {
              type: saved.source.type === "url" ? "url" : "text",
              value: sourceValue,
              prompt: String(saved?.source?.prompt || "").trim(),
            }
          : {
              type: fallbackSource.type,
              value: fallbackSource.value,
              prompt: fallbackSource.prompt || "",
            };

        entries.push({
          id: toRunEntryId(index),
          type: "generated",
          scheduledAt: clampFutureSchedule(parseTimeToToday(saved.timeOfDay)).toISOString(),
          source,
          customPrompt: String(saved.customPrompt || "").trim(),
          generatedContent: "",
          generationStatus: "planned",
          postingStatus: "pending",
          error: "",
        });
      }
    } else {
      const timeSlots = this.calculateTimeSlots(scheduler.startTime, scheduler.endTime, requestedCount);
      for (let index = 0; index < requestedCount; index++) {
        const source = eligibleContexts[index % eligibleContexts.length];
        entries.push({
          id: toRunEntryId(index),
          type: "generated",
          scheduledAt: clampFutureSchedule(timeSlots[index]).toISOString(),
          source: {
            type: source.type,
            value: source.value,
            prompt: source.prompt || "",
          },
          customPrompt: "",
          generatedContent: "",
          generationStatus: "planned",
          postingStatus: "pending",
          error: "",
        });
      }
    }

    if (constraints.attributionRequired && attribution.enabled) {
      const savedAttribution = savedArrangement.find((entry) => entry.type === "attribution");
      entries.push({
        id: toRunEntryId(entries.length + 1),
        type: "attribution",
        scheduledAt: clampFutureSchedule(parseTimeToToday(savedAttribution?.timeOfDay || attribution.dailyTime)).toISOString(),
        source: null,
        customPrompt: "",
        generatedContent: "",
        generationStatus: "planned",
        postingStatus: "pending",
        error: "",
      });
    }

    return {
      defaults: {
        scheduler,
        attribution,
      },
      constraints,
      contexts: eligibleContexts,
      entries,
    };
  }

  validateRunEntries(entries, constraints) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("At least one schedule entry is required.");
    }

    const generatedEntries = entries.filter((entry) => entry.type !== "attribution");
    if (generatedEntries.length > constraints.maxPosts) {
      throw new Error(`This plan exceeds your ${constraints.mode} limit of ${constraints.maxPosts} generated posts.`);
    }

    const uniqueSources = new Set(
      generatedEntries
        .map((entry) => `${entry?.source?.type || "text"}:${String(entry?.source?.value || "").trim()}`)
        .filter((value) => value !== "text:")
    );

    if (uniqueSources.size > constraints.maxContextSources) {
      throw new Error(`This plan exceeds your ${constraints.mode} limit of ${constraints.maxContextSources} context source(s).`);
    }

    if (constraints.attributionRequired && !entries.some((entry) => entry.type === "attribution")) {
      throw new Error("Free mode requires one attribution entry in the plan.");
    }

    for (const entry of entries) {
      if (!entry || !entry.id) {
        throw new Error("Each schedule entry must have an id.");
      }

      const scheduledAt = new Date(entry.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error(`Entry ${entry.id} has an invalid schedule time.`);
      }

      if (entry.type !== "attribution") {
        const value = String(entry?.source?.value || "").trim();
        if (!value) {
          throw new Error(`Entry ${entry.id} is missing a context source.`);
        }
      }
    }
  }

  async generateOneEntry(entry, usedFeedLinks = new Set()) {
    if (entry.type === "attribution") {
      return generateAttributionPostContent();
    }

    const sourceType = entry?.source?.type === "url" ? "url" : "text";
    const sourceValue = String(entry?.source?.value || "").trim();
    const sourcePrompt = String(entry?.source?.prompt || "").trim();
    const customPrompt = String(entry?.customPrompt || "").trim();
    const finalPrompt = [sourcePrompt, customPrompt].filter(Boolean).join(" ").trim();

    if (!sourceValue) {
      throw new Error("Context source is required for generation.");
    }

    if (sourceType === "url") {
      return this.generateFromUrlContext(sourceValue, usedFeedLinks, finalPrompt);
    }

    return generatePostContent(sourceValue, finalPrompt);
  }

  emitRunEvent(sender, payload) {
    try {
      sender?.send("scheduler-run-progress", payload);
    } catch (_error) {
      // Renderer may have detached; generation/posting should still complete.
    }
  }

  async generateRunDrafts(sender, entries, constraints, sessionId) {
    this.validateRunEntries(entries, constraints);

    const usedFeedLinks = new Set();
    const tasks = entries.map(async (entry) => {
      this.emitRunEvent(sender, {
        sessionId,
        phase: "generation",
        entryId: entry.id,
        status: "running",
        message: "Generating content...",
      });

      try {
        const generatedContent = await this.generateOneEntry(entry, usedFeedLinks);
        this.emitRunEvent(sender, {
          sessionId,
          phase: "generation",
          entryId: entry.id,
          status: "done",
          message: "Generation complete.",
        });
        return {
          ...entry,
          generatedContent,
          generationStatus: "ready",
          error: "",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emitRunEvent(sender, {
          sessionId,
          phase: "generation",
          entryId: entry.id,
          status: "failed",
          message,
        });
        return {
          ...entry,
          generatedContent: "",
          generationStatus: "failed",
          error: message,
        };
      }
    });

    return Promise.all(tasks);
  }

  async postRunEntries(sender, entries, constraints, sessionId) {
    this.validateRunEntries(entries, constraints);

    const tasks = entries.map(async (entry) => {
      const content = String(entry.generatedContent || "").trim();
      if (!content) {
        return {
          entryId: entry.id,
          success: false,
          error: "Missing generated content for this entry.",
        };
      }

      this.emitRunEvent(sender, {
        sessionId,
        phase: "posting",
        entryId: entry.id,
        status: "running",
        message: "Launching Playwright posting flow...",
      });

      let createdPost;
      try {
        createdPost = createPostV2({
          content,
          type: entry.type === "attribution" ? "attribution" : "generated",
          status: "pending",
          scheduled_at: null,
          source_url: entry?.source?.type === "url" ? String(entry?.source?.value || "") : null,
        });

        const flowResult = await runPostingFlow(
          {
            id: createdPost.id,
            content: createdPost.content,
          },
          {
            skipApproval: true,
            sendResultEmail: false,
            scheduleAt: clampFutureSchedule(entry.scheduledAt),
            fastMode: true,
          }
        );

        if (!flowResult?.ok) {
          const reason = flowResult?.reason || "Playwright posting flow failed";
          markPostV2AsFailed(createdPost.id, reason);
          this.emitRunEvent(sender, {
            sessionId,
            phase: "posting",
            entryId: entry.id,
            status: "failed",
            message: reason,
          });
          return {
            entryId: entry.id,
            postId: createdPost.id,
            success: false,
            error: reason,
          };
        }

        markPostV2AsPosted(createdPost.id);
        this.emitRunEvent(sender, {
          sessionId,
          phase: "posting",
          entryId: entry.id,
          status: "done",
          message: "Scheduled on LinkedIn successfully.",
        });

        return {
          entryId: entry.id,
          postId: createdPost.id,
          success: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (createdPost?.id) {
          markPostV2AsFailed(createdPost.id, message);
        }

        this.emitRunEvent(sender, {
          sessionId,
          phase: "posting",
          entryId: entry.id,
          status: "failed",
          message,
        });

        return {
          entryId: entry.id,
          postId: createdPost?.id,
          success: false,
          error: message,
        };
      }
    });

    return Promise.all(tasks);
  }

  // Run daily scheduling
  async runDailyScheduling() {
    try {
      console.log("[Scheduler] Running daily scheduling...");

      this.isRunning = true;

      const settings = settingsService.getSchedulerSettings();
      if (!settings.enabled) {
        console.log("[Scheduler] Scheduler is disabled");
        return { success: false, reason: "Scheduler disabled" };
      }

      // Determine post count based on licensing
      let postsPerDay = settings.postsPerDay;
      if (licenseManager.isFreeUser()) {
        postsPerDay = Math.min(2, postsPerDay); // Free tier: max 2 posts
      }

      const savedArrangement = this.getSavedArrangementEntries();
      const savedGenerated = savedArrangement.filter((entry) => entry.type !== "attribution").slice(0, postsPerDay);
      const usedFeedLinks = new Set();
      const plan = [];

      if (savedGenerated.length) {
        for (const entry of savedGenerated) {
          const generatedContent = await this.generateOneEntry(
            {
              ...entry,
              source: {
                type: entry.source?.type === "url" ? "url" : "text",
                value: String(entry.source?.value || "").trim(),
                prompt: String(entry.source?.prompt || "").trim(),
              },
              scheduledAt: parseTimeToToday(entry.timeOfDay).toISOString(),
            },
            usedFeedLinks
          );

          plan.push({
            type: "generated",
            content: generatedContent,
            scheduledAt: clampFutureSchedule(parseTimeToToday(entry.timeOfDay)),
            sourceUrl: entry.source?.type === "url" ? String(entry.source?.value || "") : null,
          });
        }
      } else {
        // Fallback for first run: keep existing behavior when no arrangement has been saved yet.
        const generatedPosts = await this.generateDailyPosts(postsPerDay);
        const timeSlots = this.calculateTimeSlots(settings.startTime, settings.endTime, generatedPosts.length);
        for (let i = 0; i < generatedPosts.length; i++) {
          plan.push({
            type: generatedPosts[i].type,
            content: generatedPosts[i].content,
            scheduledAt: timeSlots[i],
            sourceUrl: null,
          });
        }
      }

      if (plan.length === 0) {
        console.warn("[Scheduler] No posts generated");
        return { success: false, reason: "No posts generated" };
      }

      // Create posts in database and submit them through Playwright flow
      const createdPostIds = [];

      for (let i = 0; i < plan.length; i++) {
        const post = plan[i];
        const scheduledAt = post.scheduledAt;

        const createdPost = createPostV2({
          content: post.content,
          type: post.type,
          status: "pending",
          scheduled_at: null,
          source_url: post.sourceUrl,
        });

        const flowResult = await runPostingFlow(
          {
            id: createdPost.id,
            content: createdPost.content,
          },
          {
            skipApproval: true,
            sendResultEmail: false,
            scheduleAt: scheduledAt,
            fastMode: true,
          }
        );

        if (flowResult?.ok) {
          markPostV2AsPosted(createdPost.id);
        } else {
          markPostV2AsFailed(createdPost.id, flowResult?.reason || "Playwright posting flow failed");
        }

        createdPostIds.push(createdPost.id);
      }

      // Add attribution post if free tier and past day 7
      if (this.shouldAddAttributionPost()) {
        const attributionContent = await generateAttributionPostContent();
        const attributionSetting = settingsService.getAttributionSettings().dailyTime;
        const savedAttribution = savedArrangement.find((entry) => entry.type === "attribution");
        const attributionTime = clampFutureSchedule(parseTimeToToday(savedAttribution?.timeOfDay || attributionSetting));

        const attributionPost = createPostV2({
          content: attributionContent,
          type: "attribution",
          status: "pending",
          scheduled_at: null,
        });

        const attributionResult = await runPostingFlow(
          {
            id: attributionPost.id,
            content: attributionPost.content,
          },
          {
            skipApproval: true,
            sendResultEmail: false,
            scheduleAt: attributionTime,
            fastMode: true,
          }
        );

        if (attributionResult?.ok) {
          markPostV2AsPosted(attributionPost.id);
        } else {
          markPostV2AsFailed(attributionPost.id, attributionResult?.reason || "Playwright posting flow failed");
        }

        createdPostIds.push(attributionPost.id);
      }

      console.log(`[Scheduler] Created ${createdPostIds.length} posts`);

      return {
        success: true,
        postsCreated: createdPostIds.length,
        postIds: createdPostIds,
        nextRun: this.getNextScheduledTime(),
      };
    } catch (error) {
      console.error("[Scheduler] Error during daily scheduling:", error);
      return { success: false, error: error.message };
    } finally {
      this.isRunning = false;
    }
  }

  // Start scheduler
  startScheduler() {
    if (this.cronJob) {
      console.log("[Scheduler] Already running");
      return;
    }

    // Run at 9 AM every day (hardcoded for now, later configurable)
    this.cronJob = cron.schedule("0 9 * * *", async () => {
      await this.runDailyScheduling();
    });

    console.log("[Scheduler] Started (9 AM daily)");
  }

  // Stop scheduler
  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("[Scheduler] Stopped");
    }
  }

  // Get scheduler status
  getStatus() {
    const settings = settingsService.getSchedulerSettings();
    return {
      enabled: settings.enabled && this.cronJob !== null,
      running: this.isRunning,
      startTime: settings.startTime,
      endTime: settings.endTime,
      postsPerDay: settings.postsPerDay,
      nextRun: this.getNextScheduledTime(),
      scheduledPosts: listScheduledPostsV2().length,
    };
  }

  // Calculate next scheduled run time
  getNextScheduledTime() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    // If it's before 9 AM today, next run is today at 9 AM
    const today = new Date(now);
    today.setHours(9, 0, 0, 0);
    if (now < today) {
      return today;
    }

    return tomorrow;
  }
}

const schedulerService = new SchedulerService();

// IPC Handlers
ipcMain.handle("get-scheduler-status", async (event) => {
  try {
    return schedulerService.getStatus();
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("run-scheduler-now", async (event) => {
  try {
    return await schedulerService.runDailyScheduling();
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("get-scheduler-run-plan", async () => {
  try {
    return schedulerService.buildDefaultRunPlan();
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("generate-scheduler-run-drafts", async (event, payload = {}) => {
  try {
    const sessionId = String(payload.sessionId || `${Date.now()}-${Math.floor(Math.random() * 9999)}`);
    const constraints = payload.constraints || schedulerService.getRunConstraints();
    const entries = Array.isArray(payload.entries) ? payload.entries : [];

    schedulerService.saveArrangementEntries(entries);

    const generatedEntries = await schedulerService.generateRunDrafts(event.sender, entries, constraints, sessionId);
    const failedCount = generatedEntries.filter((entry) => entry.generationStatus === "failed").length;

    return {
      sessionId,
      entries: generatedEntries,
      summary: {
        total: generatedEntries.length,
        generated: generatedEntries.length - failedCount,
        failed: failedCount,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("regenerate-scheduler-run-entry", async (event, payload = {}) => {
  try {
    const sessionId = String(payload.sessionId || `${Date.now()}-${Math.floor(Math.random() * 9999)}`);
    const entry = payload.entry;
    if (!entry || !entry.id) {
      throw new Error("A valid entry is required for regeneration.");
    }

    const tempContext = payload.temporaryContext;
    const nextEntry = {
      ...entry,
      source: tempContext && String(tempContext.value || "").trim()
        ? {
            type: tempContext.type === "url" ? "url" : "text",
            value: String(tempContext.value || "").trim(),
            prompt: String(tempContext.prompt || "").trim(),
          }
        : entry.source,
      customPrompt: String(payload.customPrompt || entry.customPrompt || "").trim(),
    };

    schedulerService.emitRunEvent(event.sender, {
      sessionId,
      phase: "generation",
      entryId: nextEntry.id,
      status: "running",
      message: "Regenerating draft...",
    });

    const generatedContent = await schedulerService.generateOneEntry(nextEntry);

    schedulerService.emitRunEvent(event.sender, {
      sessionId,
      phase: "generation",
      entryId: nextEntry.id,
      status: "done",
      message: "Draft regenerated.",
    });

    return {
      sessionId,
      entry: {
        ...nextEntry,
        generatedContent,
        generationStatus: "ready",
        error: "",
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("execute-scheduler-run", async (event, payload = {}) => {
  try {
    const sessionId = String(payload.sessionId || `${Date.now()}-${Math.floor(Math.random() * 9999)}`);
    const constraints = payload.constraints || schedulerService.getRunConstraints();
    const entries = Array.isArray(payload.entries) ? payload.entries : [];

    schedulerService.saveArrangementEntries(entries);

    const results = await schedulerService.postRunEntries(event.sender, entries, constraints, sessionId);
    const failedCount = results.filter((result) => !result.success).length;

    return {
      sessionId,
      results,
      summary: {
        total: results.length,
        posted: results.length - failedCount,
        failed: failedCount,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
});

module.exports = {
  schedulerService,
};
