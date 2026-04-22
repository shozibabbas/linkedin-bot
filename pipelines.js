const { ensurePendingPostFromOpenAI } = require("./content-generator");
const { ensurePendingReviewPostFromFeed } = require("./review-generator");

const PIPELINE_DEFS = [
  {
    key: "work_context",
    name: "Work Context Insights",
    description: "Uses the work context URL from .env to generate technical LinkedIn posts.",
    cadenceLabel: "Every 3 hours",
    cron: "0 */3 * * *",
    defaultEnabled: true,
    settingKey: "pipeline_work_context_enabled",
    generatePendingPost: ensurePendingPostFromOpenAI,
  },
  {
    key: "rss_review",
    name: "RSS Article Reviews",
    description: "Fetches the RSS feed, picks the article most relevant to your work context, and writes a review post.",
    cadenceLabel: "Every 6 hours",
    cron: "0 */6 * * *",
    defaultEnabled: true,
    settingKey: "pipeline_rss_review_enabled",
    generatePendingPost: ensurePendingReviewPostFromFeed,
  },
];

function getPipelineDefinition(key) {
  return PIPELINE_DEFS.find((pipeline) => pipeline.key === key) || null;
}

function listPipelineDefinitions() {
  return PIPELINE_DEFS.slice();
}

function toPipelineMetadata(pipeline, enabled) {
  return {
    key: pipeline.key,
    name: pipeline.name,
    description: pipeline.description,
    cadenceLabel: pipeline.cadenceLabel,
    cron: pipeline.cron,
    enabled,
  };
}

module.exports = {
  getPipelineDefinition,
  listPipelineDefinitions,
  toPipelineMetadata,
};