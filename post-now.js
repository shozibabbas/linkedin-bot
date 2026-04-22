const { getNextPendingPost } = require("./db");
const { ensurePendingPostFromOpenAI, fetchWorkContextForToday } = require("./content-generator");
const { runPostingFlow } = require("./post");

async function main() {
  try {
    await fetchWorkContextForToday();
  } catch (error) {
    console.warn("[post-now] Could not refresh daily work context:", error instanceof Error ? error.message : error);
  }

  let post = getNextPendingPost();

  if (!post) {
    console.log("[post-now] No pending posts. Generating one with OpenAI...");
    post = await ensurePendingPostFromOpenAI();
    console.log(`[post-now] Generated pending post #${post.id}.`);
  }

  await runPostingFlow(post);
}

if (require.main === module) {
  main();
}
