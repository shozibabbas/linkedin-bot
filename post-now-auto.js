const { getNextPendingPost } = require("./db");
const { ensurePendingPostFromOpenAI, fetchWorkContextForToday } = require("./content-generator");
const { runPostingFlow } = require("./post");

async function main() {
  try {
    await fetchWorkContextForToday();
  } catch (error) {
    console.warn("[post-now:auto] Could not refresh daily work context:", error instanceof Error ? error.message : error);
  }

  let post = getNextPendingPost();

  if (!post) {
    console.log("[post-now:auto] No pending posts. Generating one with OpenAI...");
    post = await ensurePendingPostFromOpenAI();
    console.log(`[post-now:auto] Generated pending post #${post.id}.`);
  }

  console.log(`[post-now:auto] Running auto-approved flow for post #${post.id}.`);
  await runPostingFlow(post, { skipApproval: true, sendResultEmail: false });
}

if (require.main === module) {
  main();
}
