const { getNextPendingPost } = require("./db");
const { runPostingFlow } = require("./post");

async function main() {
  const post = getNextPendingPost();

  if (!post) {
    console.log("[post-now] No pending posts.");
    return;
  }

  await runPostingFlow(post);
}

if (require.main === module) {
  main();
}
