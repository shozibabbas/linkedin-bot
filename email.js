const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();

function buildTransporter() {
  const { EMAIL_USER, EMAIL_PASS, SMTP_HOST, SMTP_PORT, SMTP_SECURE } = process.env;

  if (!EMAIL_USER || !EMAIL_PASS) {
    return null;
  }

  if (SMTP_HOST) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: String(SMTP_SECURE || "false") === "true",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
}

async function sendPostResultEmail({ post, status, error }) {
  const { EMAIL_USER, EMAIL_TO } = process.env;

  if (!EMAIL_TO) {
    console.warn("[email] EMAIL_TO is not set. Skipping email notification.");
    return;
  }

  const transporter = buildTransporter();
  if (!transporter) {
    console.warn("[email] EMAIL_USER or EMAIL_PASS is missing. Skipping email notification.");
    return;
  }

  const subject = `[LinkedIn Bot] Post #${post.id} ${status.toUpperCase()}`;
  const text = [
    `Post ID: ${post.id}`,
    `Status: ${status}`,
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "Content:",
    post.content,
    "",
    error ? `Error: ${error}` : "Error: none",
  ].join("\n");

  await transporter.sendMail({
    from: EMAIL_USER,
    to: EMAIL_TO,
    subject,
    text,
  });
}

async function sendApprovalRequestEmail({ post }) {
  const { EMAIL_USER, EMAIL_TO, EMAIL_APPROVAL_SECRET } = process.env;

  if (!EMAIL_TO) {
    console.warn("[email] EMAIL_TO is not set. Skipping approval email.");
    return null;
  }

  if (!EMAIL_APPROVAL_SECRET) {
    console.warn("[email] EMAIL_APPROVAL_SECRET is not set. Skipping approval email.");
    return null;
  }

  const transporter = buildTransporter();
  if (!transporter) {
    console.warn("[email] EMAIL_USER or EMAIL_PASS is missing. Skipping approval email.");
    return null;
  }

  const subject = `[LinkedIn Bot] Approval needed for post #${post.id}`;
  const text = [
    `A pending LinkedIn post is waiting for approval.`,
    ``,
    `Post ID: ${post.id}`,
    `Timestamp: ${new Date().toISOString()}`,
    ``,
    `Post content:`,
    post.content,
    ``,
    `To approve automatic posting from this machine, reply to this email and include this exact secret string anywhere in the reply body:`,
    EMAIL_APPROVAL_SECRET,
    ``,
    `This reply must stay in the same email thread so the system can match it to post #${post.id}.`,
  ].join("\n");

  const info = await transporter.sendMail({
    from: EMAIL_USER,
    to: EMAIL_TO,
    subject,
    text,
  });

  return info.messageId || null;
}

module.exports = {
  sendApprovalRequestEmail,
  sendPostResultEmail,
};
