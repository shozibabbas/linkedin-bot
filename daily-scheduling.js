const {
  getDailyScheduleRunByDay,
  getSetting,
  setSetting,
  upsertDailyScheduleRun,
} = require("./db");
const { getPipelineDefinition, listPipelineDefinitions } = require("./pipelines");
const { runPostingFlow } = require("./post");

function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEndOfDay(date = new Date()) {
  const end = new Date(date);
  end.setHours(23, 59, 0, 0);
  return end;
}

function getRemainingMinutesBeforeEndOfDay(date = new Date()) {
  const diffMs = getEndOfDay(date).getTime() - date.getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

function parseBooleanSetting(key, fallback) {
  const value = String(getSetting(key, fallback ? "true" : "false") || "").trim().toLowerCase();
  return value === "true";
}

function parseNumberSetting(key, fallback) {
  const parsed = Number(getSetting(key, String(fallback)));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseJsonSettingArray(key, fallback = []) {
  const raw = getSetting(key, JSON.stringify(fallback));
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function uniquePipelineKeys(keys) {
  const valid = new Set(listPipelineDefinitions().map((pipeline) => pipeline.key));
  const out = [];
  for (const key of keys || []) {
    if (valid.has(key) && !out.includes(key)) {
      out.push(key);
    }
  }
  return out;
}

function getDefaultGenerationPipelineKeys() {
  const defaultKeys = listPipelineDefinitions()
    .filter((pipeline) => parseBooleanSetting(pipeline.settingKey, pipeline.defaultEnabled))
    .map((pipeline) => pipeline.key);
  return defaultKeys.length ? defaultKeys : ["work_context"];
}

function getDailySchedulerSettings() {
  const generationPipelineKeys = uniquePipelineKeys(
    parseJsonSettingArray("daily_scheduler_generation_pipeline_keys", getDefaultGenerationPipelineKeys())
  );
  const continuePipelineKeys = uniquePipelineKeys(parseJsonSettingArray("daily_scheduler_continue_pipeline_keys", []));

  return {
    enabled: parseBooleanSetting("daily_scheduler_enabled", false),
    defaultPostsPerDay: Math.max(1, Math.floor(parseNumberSetting("daily_scheduler_posts_per_day", 4))),
    autoWithoutConfirmation: parseBooleanSetting("daily_scheduler_auto_without_confirmation", false),
    generationPipelineKeys: generationPipelineKeys.length ? generationPipelineKeys : ["work_context"],
    continuePipelineKeys,
  };
}

function updateDailySchedulerSettings(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "enabled")) {
    setSetting("daily_scheduler_enabled", input.enabled ? "true" : "false");
  }
  if (Object.prototype.hasOwnProperty.call(input, "defaultPostsPerDay")) {
    setSetting("daily_scheduler_posts_per_day", String(Math.max(1, Math.floor(Number(input.defaultPostsPerDay) || 1))));
  }
  if (Object.prototype.hasOwnProperty.call(input, "autoWithoutConfirmation")) {
    setSetting("daily_scheduler_auto_without_confirmation", input.autoWithoutConfirmation ? "true" : "false");
  }
  if (Object.prototype.hasOwnProperty.call(input, "generationPipelineKeys")) {
    setSetting("daily_scheduler_generation_pipeline_keys", JSON.stringify(uniquePipelineKeys(input.generationPipelineKeys || [])));
  }
  if (Object.prototype.hasOwnProperty.call(input, "continuePipelineKeys")) {
    setSetting("daily_scheduler_continue_pipeline_keys", JSON.stringify(uniquePipelineKeys(input.continuePipelineKeys || [])));
  }

  return getDailySchedulerSettings();
}

function parsePipelinesFromRun(run) {
  if (!run || !run.pipelines_json) {
    return [];
  }
  try {
    const parsed = JSON.parse(run.pipelines_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function getTodayDailyScheduleRun(date = new Date()) {
  const run = getDailyScheduleRunByDay(getLocalDayKey(date));
  if (!run) {
    return null;
  }

  return {
    ...run,
    pipelines: parsePipelinesFromRun(run),
    auto_without_confirmation: Boolean(run.auto_without_confirmation),
  };
}

function planDailyScheduleTimes({ postsPerDay, now = new Date() }) {
  const remainingMinutes = getRemainingMinutesBeforeEndOfDay(now);
  if (remainingMinutes < 5) {
    throw new Error("Not enough time left today to schedule posts.");
  }

  const count = Math.max(1, Math.floor(Number(postsPerDay) || 1));
  const firstTime = new Date(now.getTime() + 2 * 60000);
  firstTime.setSeconds(0, 0);


  const out = [];
  const end = getEndOfDay(now);
  const availableSpanMinutes = Math.max(0, Math.floor((end.getTime() - firstTime.getTime()) / 60000));
  const actualInterval = count <= 1 ? 0 : Math.max(1, Math.floor(availableSpanMinutes / (count - 1)));

  for (let index = 0; index < count; index++) {
    const next = new Date(firstTime.getTime() + index * actualInterval * 60000);
    if (next > end) {
      out.push(new Date(end));
      continue;
    }
    out.push(next);
  }

  return {
    times: out,
    actualInterval,
    remainingMinutes,
  };
}

async function generatePostFromPipelines(pipelineKeys, pointer) {
  for (let offset = 0; offset < pipelineKeys.length; offset++) {
    const index = (pointer + offset) % pipelineKeys.length;
    const pipelineKey = pipelineKeys[index];
    const pipeline = getPipelineDefinition(pipelineKey);
    if (!pipeline) {
      continue;
    }

    const post = await pipeline.generatePendingPost();
    if (post) {
      return { post, pipelineKey, nextPointer: (index + 1) % pipelineKeys.length };
    }
  }

  return null;
}

async function scheduleWholeDayPosts(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const settings = getDailySchedulerSettings();
  const dayKey = getLocalDayKey(now);
  const existing = getDailyScheduleRunByDay(dayKey);

  if (existing && existing.status === "scheduled" && !options.force) {
    return {
      dayKey,
      skipped: true,
      reason: "already-scheduled",
      existing,
    };
  }

  const postsPerDay = Math.max(1, Math.floor(Number(options.postsPerDay) || settings.defaultPostsPerDay));
  const autoWithoutConfirmation = Boolean(
    Object.prototype.hasOwnProperty.call(options, "autoWithoutConfirmation")
      ? options.autoWithoutConfirmation
      : settings.autoWithoutConfirmation
  );

  const pipelineKeys = uniquePipelineKeys(
    (options.pipelineKeys && options.pipelineKeys.length ? options.pipelineKeys : settings.generationPipelineKeys) || []
  );
  if (!pipelineKeys.length) {
    throw new Error("At least one pipeline is required for daily scheduling.");
  }

  const { times, actualInterval, remainingMinutes } = planDailyScheduleTimes({ postsPerDay, now });

  let pipelinePointer = 0;
  const scheduled = [];
  const generatedJobs = [];

  try {
    for (let index = 0; index < times.length; index++) {
      const generated = await generatePostFromPipelines(pipelineKeys, pipelinePointer);
      if (!generated) {
        throw new Error("Could not generate enough posts for the day from selected pipelines.");
      }

      pipelinePointer = generated.nextPointer;

      generatedJobs.push({
        post: generated.post,
        pipelineKey: generated.pipelineKey,
        scheduleAt: times[index],
      });
    }

    await Promise.all(
      generatedJobs.map((job) =>
        runPostingFlow(job.post, {
          // Wizard-driven full-day scheduling should never block on local confirmation prompts.
          skipApproval: true,
          // Wizard runs should prioritize speed and avoid artificial typing delays.
          fastMode: true,
          scheduleAt: job.scheduleAt,
        })
      )
    );

    for (const job of generatedJobs) {
      scheduled.push({
        id: job.post.id,
        pipeline: job.pipelineKey,
        scheduledAt: job.scheduleAt.toISOString(),
      });
    }

    const run = upsertDailyScheduleRun({
      day_key: dayKey,
      posts_requested: postsPerDay,
      interval_minutes: actualInterval,
      pipelines_json: JSON.stringify(pipelineKeys),
      auto_without_confirmation: autoWithoutConfirmation,
      status: "scheduled",
      details: JSON.stringify({ scheduled }),
    });

    if (options.saveAsDefaults) {
      updateDailySchedulerSettings({
        defaultPostsPerDay: postsPerDay,
        autoWithoutConfirmation,
        generationPipelineKeys: pipelineKeys,
      });
    }

    return {
      dayKey,
      skipped: false,
      run,
      scheduled,
      actualInterval,
      remainingMinutes,
      postsRequested: postsPerDay,
      pipelineKeys,
      autoWithoutConfirmation,
    };
  } catch (error) {
    upsertDailyScheduleRun({
      day_key: dayKey,
      posts_requested: postsPerDay,
      interval_minutes: actualInterval,
      pipelines_json: JSON.stringify(pipelineKeys),
      auto_without_confirmation: autoWithoutConfirmation,
      status: "failed",
      details: String(error instanceof Error ? error.message : error),
    });
    throw error;
  }
}

function shouldRunRegularPipelineWhenDailySchedulerEnabled(pipelineKey, date = new Date()) {
  const settings = getDailySchedulerSettings();
  if (!settings.enabled) {
    return true;
  }

  const todayRun = getTodayDailyScheduleRun(date);
  if (!todayRun || todayRun.status !== "scheduled") {
    return false;
  }

  if (!settings.autoWithoutConfirmation) {
    return false;
  }

  return settings.continuePipelineKeys.includes(pipelineKey);
}

module.exports = {
  getDailySchedulerSettings,
  getLocalDayKey,
  getRemainingMinutesBeforeEndOfDay,
  getTodayDailyScheduleRun,
  planDailyScheduleTimes,
  scheduleWholeDayPosts,
  shouldRunRegularPipelineWhenDailySchedulerEnabled,
  updateDailySchedulerSettings,
};
