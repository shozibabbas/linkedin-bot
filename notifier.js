const notifierLib = require("node-notifier");

const NotificationCenter = notifierLib.NotificationCenter;
const notifier = new NotificationCenter({ withFallback: false });

function buildPreview(content, maxLength = 120) {
  const sanitized = String(content || "").replace(/\s+/g, " ").trim();
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized;
}

async function notifyPostAvailable(post) {
  const preview = buildPreview(post.content);

  return new Promise((resolve) => {
    notifier.notify(
      {
        title: "LinkedIn Post Ready",
        message: `Post #${post.id}: ${preview}`,
        sound: true,
        wait: true,
      },
      async (error, response) => {
        if (error) {
          console.error("[notifier] Notification error:", error.message || error);
          resolve(false);
          return;
        }

        if (response !== "activate") {
          resolve(false);
          return;
        }

        try {
          const { runPostingFlow } = require("./post");
          await runPostingFlow(post, { skipApproval: true });
          resolve(true);
        } catch (err) {
          console.error("[notifier] Posting flow failed:", err instanceof Error ? err.message : err);
          resolve(false);
        }
      }
    );
  });
}

module.exports = {
  notifyPostAvailable,
};
