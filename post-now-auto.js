const { getNextPendingPost } = require("./db");
const { runPostingFlow } = require("./post");

async function main() {
  const post = getNextPendingPost();

  if (!post) {
    console.log("[post-now:auto] No pending posts.");
    return;
  }

  console.log(`[post-now:auto] Running auto-approved flow for post #${post.id}.`);
  await runPostingFlow(post, { skipApproval: true, sendResultEmail: false });
}

if (require.main === module) {
  main();
}
