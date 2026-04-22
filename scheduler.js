const cron = require("node-cron");
const dotenv = require("dotenv");

const { markApprovalEmailSent, getSetting } = require("./db");
const { findApprovedPostsFromInbox } = require("./approval-inbox");
const { sendApprovalRequestEmail } = require("./email");
const { notifyPostAvailable } = require("./notifier");
const { listPipelineDefinitions } = require("./pipelines");
const { runPostingFlow } = require("./post");

dotenv.config();

const activePostIds = new Set();
let postingQueue = Promise.resolve();

function queuePostProcessing(post, options = {}) {
  const run = async () => {
    if (activePostIds.has(post.id)) {
      console.log(`[scheduler] Post #${post.id} is already being processed.`);
      return;
    }

    activePostIds.add(post.id);
    try {
      await runPostingFlow(post, options);
    } finally {
      activePostIds.delete(post.id);
    }
  };

  const nextRun = postingQueue.then(run, run);
  postingQueue = nextRun.catch(() => {});
  return nextRun;
}

async function dispatchPostAccordingToMode(post, pipeline) {
  console.log(`[scheduler] ${pipeline.name} created pending post #${post.id}. Checking posting mode...`);
  const postingMode = getSetting("posting_mode", "confirm_email");

  if (postingMode === "auto") {
    console.log(`[scheduler] Posting mode is AUTO. Posting immediately without confirmation...`);
    await queuePostProcessing(post, { skipApproval: true });
    return;
  }

  if (postingMode === "confirm_push") {
    console.log(`[scheduler] Posting mode is PUSH. Sending push notification for approval...`);
    await notifyPostAvailable(post);
    return;
  }

  console.log(`[scheduler] Posting mode is EMAIL. Sending approval email...`);
  const messageId = await sendApprovalRequestEmail({ post });
  if (messageId) {
    markApprovalEmailSent(post.id, messageId);
    console.log(`[scheduler] Approval email sent for post #${post.id}.`);
  }
}

async function runPipeline(pipelineKey) {
  const pipeline = listPipelineDefinitions().find((entry) => entry.key === pipelineKey);
  if (!pipeline) {
    throw new Error(`Unknown pipeline: ${pipelineKey}`);
  }

  const enabled = getSetting(pipeline.settingKey, pipeline.defaultEnabled ? "true" : "false") !== "false";
  if (!enabled) {
    console.log(`[scheduler] ${pipeline.name} is disabled. Skipping.`);
    return null;
  }

  try {
    const post = await pipeline.generatePendingPost();
    if (!post) {
      console.log(`[scheduler] ${pipeline.name} had nothing new to generate.`);
      return null;
    }

    const typeLabel = post.contentType ? ` [type: ${post.contentType.name}]` : "";
    console.log(`[scheduler] ${pipeline.name} generated post #${post.id}.${typeLabel}`);
    await dispatchPostAccordingToMode(post, pipeline);
    return post;
  } catch (error) {
    console.error(`[scheduler] ${pipeline.name} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function checkEmailApprovals() {
  try {
    const approvedPosts = await findApprovedPostsFromInbox();
    if (!approvedPosts.length) {
      return;
    }

    for (const post of approvedPosts) {
      console.log(`[scheduler] Email approval received for post #${post.id}. Starting automated posting flow...`);
      await queuePostProcessing(post, { skipApproval: true });
    }
  } catch (error) {
    console.error("[scheduler] Email approval check failed:", error instanceof Error ? error.message : error);
  }
}

function startScheduler() {
  for (const pipeline of listPipelineDefinitions()) {
    cron.schedule(pipeline.cron, async () => {
      await runPipeline(pipeline.key);
    });
  }

  cron.schedule(process.env.EMAIL_APPROVAL_POLL_CRON || "*/1 * * * *", async () => {
    await checkEmailApprovals();
  });

  console.log("[scheduler] Running content pipelines.");
  for (const pipeline of listPipelineDefinitions()) {
    console.log(`[scheduler] ${pipeline.name}: ${pipeline.cadenceLabel} (${pipeline.cron})`);
  }
  console.log("[scheduler] First pipeline checks run immediately.");
  console.log("[scheduler] Polling inbox for approval replies every minute.");

  for (const pipeline of listPipelineDefinitions()) {
    runPipeline(pipeline.key);
  }
  checkEmailApprovals();
}

if (require.main === module) {
  startScheduler();
}

module.exports = {
  checkEmailApprovals,
  dispatchPostAccordingToMode,
  runPipeline,
  startScheduler,
  checkPendingPost: () => runPipeline("work_context"),
};
