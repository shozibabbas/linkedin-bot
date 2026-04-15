const cron = require("node-cron");
const dotenv = require("dotenv");

const { getNextPendingPost, markApprovalEmailSent } = require("./db");
const { findApprovedPostsFromInbox } = require("./approval-inbox");
const { sendApprovalRequestEmail } = require("./email");
const { notifyPostAvailable } = require("./notifier");
const { runPostingFlow } = require("./post");

dotenv.config();

const activePostIds = new Set();

async function processPost(post, options = {}) {
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
}

async function checkPendingPost() {
  try {
    const post = getNextPendingPost();

    if (!post) {
      console.log("[scheduler] No pending posts.");
      return;
    }

    console.log(`[scheduler] Pending post found (#${post.id}). Sending approval email and notification...`);
    const messageId = await sendApprovalRequestEmail({ post });
    if (messageId) {
      markApprovalEmailSent(post.id, messageId);
      console.log(`[scheduler] Approval email sent for post #${post.id}.`);
    }

    await notifyPostAvailable(post);
  } catch (error) {
    console.error("[scheduler] Check failed:", error instanceof Error ? error.message : error);
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
      await processPost(post, { skipApproval: true });
    }
  } catch (error) {
    console.error("[scheduler] Email approval check failed:", error instanceof Error ? error.message : error);
  }
}

function startScheduler() {
  // Every 3 hours at minute 0.
  cron.schedule("0 */3 * * *", async () => {
    await checkPendingPost();
  });

  cron.schedule(process.env.EMAIL_APPROVAL_POLL_CRON || "*/1 * * * *", async () => {
    await checkEmailApprovals();
  });

  console.log("[scheduler] Running. Checking every 3 hours.");
  console.log("[scheduler] First check runs immediately.");
  console.log("[scheduler] Polling inbox for approval replies every minute.");

  checkPendingPost();
  checkEmailApprovals();
}

if (require.main === module) {
  startScheduler();
}

module.exports = {
  checkEmailApprovals,
  startScheduler,
  checkPendingPost,
};
