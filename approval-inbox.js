const dotenv = require("dotenv");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

const { getPostById, listPendingApprovalPosts, markEmailApproved } = require("./db");

dotenv.config();

function buildImapConfig() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER || process.env.EMAIL_USER;
  const pass = process.env.IMAP_PASS || process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port: Number(process.env.IMAP_PORT || 993),
    secure: String(process.env.IMAP_SECURE || "true") === "true",
    auth: { user, pass },
  };
}

function normalizeMessageIds(parsed) {
  const candidates = [];

  if (parsed.inReplyTo) {
    candidates.push(parsed.inReplyTo);
  }

  if (parsed.references && parsed.references.length) {
    candidates.push(...parsed.references);
  }

  return candidates.map((value) => String(value || "").trim()).filter(Boolean);
}

function includesSecret(parsed, secret) {
  const bodies = [parsed.text, parsed.html ? String(parsed.html) : ""].filter(Boolean).join("\n");
  return bodies.includes(secret);
}

async function findApprovedPostsFromInbox() {
  const imapConfig = buildImapConfig();
  const approvalSecret = process.env.EMAIL_APPROVAL_SECRET;
  const expectedSender = (process.env.EMAIL_TO || "").toLowerCase();

  if (!imapConfig || !approvalSecret) {
    return [];
  }

  const pendingPosts = listPendingApprovalPosts();
  if (!pendingPosts.length) {
    return [];
  }

  const pendingByMessageId = new Map(
    pendingPosts
      .filter((post) => post.approval_email_message_id)
      .map((post) => [String(post.approval_email_message_id).trim(), post])
  );

  if (!pendingByMessageId.size) {
    return [];
  }

  const client = new ImapFlow({
    ...imapConfig,
    logger: false,
  });

  const approvedPosts = [];

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    const searchSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const messageUids = await client.search({ since: searchSince });

    for await (const message of client.fetch(messageUids, {
      uid: true,
      envelope: true,
      source: true,
    })) {
      const parsed = await simpleParser(message.source);
      const fromText = (parsed.from && parsed.from.text ? parsed.from.text : "").toLowerCase();
      if (expectedSender && !fromText.includes(expectedSender)) {
        continue;
      }

      if (!includesSecret(parsed, approvalSecret)) {
        continue;
      }

      const referencedMessageIds = normalizeMessageIds(parsed);
      const matchingMessageId = referencedMessageIds.find((messageId) => pendingByMessageId.has(messageId));
      if (!matchingMessageId) {
        continue;
      }

      const post = pendingByMessageId.get(matchingMessageId);
      if (!post) {
        continue;
      }

      markEmailApproved(post.id);
      const refreshed = getPostById(post.id);
      if (refreshed) {
        approvedPosts.push(refreshed);
      }

      pendingByMessageId.delete(matchingMessageId);
      if (!pendingByMessageId.size) {
        break;
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return approvedPosts;
}

module.exports = {
  findApprovedPostsFromInbox,
};
