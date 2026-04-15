const path = require("node:path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "posts.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed')),
    posted_at DATETIME,
    error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const existingColumns = db.prepare("PRAGMA table_info(posts)").all().map((column) => column.name);

if (!existingColumns.includes("approval_email_message_id")) {
  db.exec("ALTER TABLE posts ADD COLUMN approval_email_message_id TEXT");
}

if (!existingColumns.includes("approval_requested_at")) {
  db.exec("ALTER TABLE posts ADD COLUMN approval_requested_at DATETIME");
}

if (!existingColumns.includes("email_approved_at")) {
  db.exec("ALTER TABLE posts ADD COLUMN email_approved_at DATETIME");
}

const addPostStmt = db.prepare(`
  INSERT INTO posts (content, status)
  VALUES (?, 'pending')
`);

const nextPendingStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at
  FROM posts
  WHERE status = 'pending'
  ORDER BY id ASC
  LIMIT 1
`);

const listPostsStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at
  FROM posts
  ORDER BY id DESC
`);

const getPostByIdStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at
  FROM posts
  WHERE id = ?
`);

const listPendingApprovalPostsStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at
  FROM posts
  WHERE status = 'pending'
    AND approval_email_message_id IS NOT NULL
    AND email_approved_at IS NULL
  ORDER BY approval_requested_at DESC, id DESC
`);

const createPostStmt = db.prepare(`
  INSERT INTO posts (content, status, posted_at, error)
  VALUES (@content, @status, @posted_at, @error)
`);

const updatePostStmt = db.prepare(`
  UPDATE posts
  SET content = @content,
      status = @status,
      posted_at = @posted_at,
      error = @error,
      approval_email_message_id = @approval_email_message_id,
      approval_requested_at = @approval_requested_at,
      email_approved_at = @email_approved_at
  WHERE id = @id
`);

const deletePostStmt = db.prepare(`
  DELETE FROM posts
  WHERE id = ?
`);

const markApprovalEmailSentStmt = db.prepare(`
  UPDATE posts
  SET approval_email_message_id = ?,
      approval_requested_at = CURRENT_TIMESTAMP,
      email_approved_at = NULL
  WHERE id = ?
`);

const markEmailApprovedStmt = db.prepare(`
  UPDATE posts
  SET email_approved_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const clearApprovalStateStmt = db.prepare(`
  UPDATE posts
  SET approval_email_message_id = NULL,
      approval_requested_at = NULL,
      email_approved_at = NULL
  WHERE id = ?
`);

const markPostedStmt = db.prepare(`
  UPDATE posts
  SET status = 'posted', posted_at = CURRENT_TIMESTAMP, error = NULL
  WHERE id = ?
`);

const markFailedStmt = db.prepare(`
  UPDATE posts
  SET status = 'failed', posted_at = CURRENT_TIMESTAMP, error = ?
  WHERE id = ?
`);

function addPost(content) {
  return addPostStmt.run(content);
}

function getNextPendingPost() {
  return nextPendingStmt.get() || null;
}

function listPosts() {
  return listPostsStmt.all();
}

function listPendingApprovalPosts() {
  return listPendingApprovalPostsStmt.all();
}

function getPostById(id) {
  return getPostByIdStmt.get(id) || null;
}

function normalizePostInput(input) {
  const status = input.status || "pending";
  if (!["pending", "posted", "failed"].includes(status)) {
    throw new Error("Invalid status. Expected pending, posted, or failed.");
  }

  return {
    content: String(input.content || "").trim(),
    status,
    posted_at: input.posted_at || null,
    error: input.error ? String(input.error) : null,
    approval_email_message_id: input.approval_email_message_id || null,
    approval_requested_at: input.approval_requested_at || null,
    email_approved_at: input.email_approved_at || null,
  };
}

function createPost(input) {
  const post = normalizePostInput(input);
  if (!post.content) {
    throw new Error("Post content is required.");
  }

  const result = createPostStmt.run(post);
  return getPostById(result.lastInsertRowid);
}

function updatePost(id, input) {
  const existing = getPostById(id);
  if (!existing) {
    return null;
  }

  const post = normalizePostInput({
    content: input.content ?? existing.content,
    status: input.status ?? existing.status,
    posted_at: Object.prototype.hasOwnProperty.call(input, "posted_at") ? input.posted_at : existing.posted_at,
    error: Object.prototype.hasOwnProperty.call(input, "error") ? input.error : existing.error,
  });

  updatePostStmt.run({ id, ...post });
  return getPostById(id);
}

function deletePost(id) {
  return deletePostStmt.run(id);
}

function markPosted(id) {
  clearApprovalStateStmt.run(id);
  return markPostedStmt.run(id);
}

function markFailed(id, errorMessage) {
  const trimmedError = String(errorMessage || "Unknown error").slice(0, 2000);
  clearApprovalStateStmt.run(id);
  return markFailedStmt.run(trimmedError, id);
}

function markApprovalEmailSent(id, messageId) {
  return markApprovalEmailSentStmt.run(String(messageId || ""), id);
}

function markEmailApproved(id) {
  return markEmailApprovedStmt.run(id);
}

function clearApprovalState(id) {
  return clearApprovalStateStmt.run(id);
}

module.exports = {
  db,
  addPost,
  clearApprovalState,
  createPost,
  deletePost,
  getNextPendingPost,
  getPostById,
  listPosts,
  listPendingApprovalPosts,
  markApprovalEmailSent,
  markEmailApproved,
  markPosted,
  markFailed,
  updatePost,
};
