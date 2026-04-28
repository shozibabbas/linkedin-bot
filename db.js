const path = require("node:path");
const Database = require("better-sqlite3");
const { getWritableAppDirectory } = require("./app-paths");

// In packaged app, use userData directory (writable); in dev, use project root
const dbDir = getWritableAppDirectory(__dirname);
const dbPath = path.join(dbDir, "posts.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// NEW SCHEMA FOR ELECTRON APP

db.exec(`
  CREATE TABLE IF NOT EXISTS posts_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'posted', 'failed')),
    type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('manual', 'generated', 'attribution')),
    scheduled_at DATETIME,
    posted_at DATETIME,
    error TEXT,
    source_url TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS trial_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    install_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    posts_count INTEGER DEFAULT 0
  );
`);

// LEGACY SCHEMA (kept for backward compatibility)

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

db.exec(`
  CREATE TABLE IF NOT EXISTS web_context_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url TEXT NOT NULL,
    fetched_date TEXT NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    content TEXT NOT NULL,
    UNIQUE(source_url, fetched_date)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_schedule_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_key TEXT NOT NULL UNIQUE,
    scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    posts_requested INTEGER NOT NULL,
    interval_minutes INTEGER NOT NULL,
    pipelines_json TEXT NOT NULL,
    auto_without_confirmation INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    details TEXT
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

if (!existingColumns.includes("source_pipeline")) {
  db.exec("ALTER TABLE posts ADD COLUMN source_pipeline TEXT");
}

if (!existingColumns.includes("source_reference")) {
  db.exec("ALTER TABLE posts ADD COLUMN source_reference TEXT");
}

db.exec("CREATE INDEX IF NOT EXISTS idx_posts_source_reference ON posts(source_pipeline, source_reference)");

const addPostStmt = db.prepare(`
  INSERT INTO posts (content, status, source_pipeline, source_reference)
  VALUES (@content, 'pending', @source_pipeline, @source_reference)
`);

const nextPendingStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at,
         source_pipeline, source_reference
  FROM posts
  WHERE status = 'pending'
  ORDER BY id ASC
  LIMIT 1
`);

const listPostsStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at,
         source_pipeline, source_reference
  FROM posts
  ORDER BY id DESC
`);

const getPostByIdStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at,
         source_pipeline, source_reference
  FROM posts
  WHERE id = ?
`);

const listPendingApprovalPostsStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at,
         source_pipeline, source_reference
  FROM posts
  WHERE status = 'pending'
    AND approval_email_message_id IS NOT NULL
    AND email_approved_at IS NULL
  ORDER BY approval_requested_at DESC, id DESC
`);

const createPostStmt = db.prepare(`
  INSERT INTO posts (content, status, posted_at, error, source_pipeline, source_reference)
  VALUES (@content, @status, @posted_at, @error, @source_pipeline, @source_reference)
`);

const updatePostStmt = db.prepare(`
  UPDATE posts
  SET content = @content,
      status = @status,
      posted_at = @posted_at,
      error = @error,
      approval_email_message_id = @approval_email_message_id,
      approval_requested_at = @approval_requested_at,
      email_approved_at = @email_approved_at,
      source_pipeline = @source_pipeline,
      source_reference = @source_reference
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

const latestPostStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at,
         source_pipeline, source_reference
  FROM posts
  ORDER BY id DESC
  LIMIT 1
`);

const postBySourceReferenceStmt = db.prepare(`
  SELECT id, content, status, posted_at, error, created_at,
         approval_email_message_id, approval_requested_at, email_approved_at,
         source_pipeline, source_reference
  FROM posts
  WHERE source_pipeline = ? AND source_reference = ?
  ORDER BY id DESC
  LIMIT 1
`);

const recentPostContentsStmt = db.prepare(`
  SELECT content
  FROM posts
  ORDER BY id DESC
  LIMIT ?
`);

const latestWebContextBySourceStmt = db.prepare(`
  SELECT id, source_url, fetched_date, fetched_at, content
  FROM web_context_cache
  WHERE source_url = ?
  ORDER BY fetched_at DESC
  LIMIT 1
`);

const webContextBySourceAndDateStmt = db.prepare(`
  SELECT id, source_url, fetched_date, fetched_at, content
  FROM web_context_cache
  WHERE source_url = ? AND fetched_date = ?
  ORDER BY fetched_at DESC
  LIMIT 1
`);

const upsertWebContextStmt = db.prepare(`
  INSERT INTO web_context_cache (source_url, fetched_date, content)
  VALUES (@source_url, @fetched_date, @content)
  ON CONFLICT(source_url, fetched_date)
  DO UPDATE SET content = excluded.content, fetched_at = CURRENT_TIMESTAMP
`);

const dailyRunByDayStmt = db.prepare(`
  SELECT id, day_key, scheduled_at, posts_requested, interval_minutes,
         pipelines_json, auto_without_confirmation, status, details
  FROM daily_schedule_runs
  WHERE day_key = ?
  LIMIT 1
`);

const upsertDailyRunStmt = db.prepare(`
  INSERT INTO daily_schedule_runs (
    day_key,
    posts_requested,
    interval_minutes,
    pipelines_json,
    auto_without_confirmation,
    status,
    details
  )
  VALUES (
    @day_key,
    @posts_requested,
    @interval_minutes,
    @pipelines_json,
    @auto_without_confirmation,
    @status,
    @details
  )
  ON CONFLICT(day_key)
  DO UPDATE SET
    scheduled_at = CURRENT_TIMESTAMP,
    posts_requested = excluded.posts_requested,
    interval_minutes = excluded.interval_minutes,
    pipelines_json = excluded.pipelines_json,
    auto_without_confirmation = excluded.auto_without_confirmation,
    status = excluded.status,
    details = excluded.details
`);

function addPost(content, options = {}) {
  return addPostStmt.run({
    content,
    source_pipeline: options.sourcePipeline || null,
    source_reference: options.sourceReference || null,
  });
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
    source_pipeline: input.source_pipeline ? String(input.source_pipeline) : null,
    source_reference: input.source_reference ? String(input.source_reference) : null,
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
    approval_email_message_id: input.approval_email_message_id ?? existing.approval_email_message_id,
    approval_requested_at: input.approval_requested_at ?? existing.approval_requested_at,
    email_approved_at: input.email_approved_at ?? existing.email_approved_at,
    source_pipeline: Object.prototype.hasOwnProperty.call(input, "source_pipeline") ? input.source_pipeline : existing.source_pipeline,
    source_reference: Object.prototype.hasOwnProperty.call(input, "source_reference") ? input.source_reference : existing.source_reference,
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

function getLatestPost() {
  return latestPostStmt.get() || null;
}

function getPostBySourceReference(sourcePipeline, sourceReference) {
  if (!sourcePipeline || !sourceReference) {
    return null;
  }
  return postBySourceReferenceStmt.get(sourcePipeline, sourceReference) || null;
}

function listRecentPostContents(limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  return recentPostContentsStmt.all(safeLimit).map((row) => row.content).filter(Boolean);
}

function getLatestWebContextBySource(sourceUrl) {
  return latestWebContextBySourceStmt.get(sourceUrl) || null;
}

function getWebContextBySourceAndDate(sourceUrl, fetchedDate) {
  return webContextBySourceAndDateStmt.get(sourceUrl, fetchedDate) || null;
}

const getSettingStmt = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSettingStmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

function getSetting(key, defaultValue = null) {
  const row = getSettingStmt.get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  setSettingStmt.run(key, String(value));
}

function upsertWebContext(input) {
  const sourceUrl = String(input.source_url || "").trim();
  const fetchedDate = String(input.fetched_date || "").trim();
  const content = String(input.content || "").trim();

  if (!sourceUrl) {
    throw new Error("source_url is required for web context cache.");
  }
  if (!fetchedDate) {
    throw new Error("fetched_date is required for web context cache.");
  }
  if (!content) {
    throw new Error("content is required for web context cache.");
  }

  upsertWebContextStmt.run({ source_url: sourceUrl, fetched_date: fetchedDate, content });
  return getWebContextBySourceAndDate(sourceUrl, fetchedDate);
}

function getDailyScheduleRunByDay(dayKey) {
  return dailyRunByDayStmt.get(String(dayKey || "").trim()) || null;
}

function upsertDailyScheduleRun(input) {
  const dayKey = String(input.day_key || "").trim();
  if (!dayKey) {
    throw new Error("day_key is required for daily schedule run.");
  }

  const postsRequested = Math.max(1, Number(input.posts_requested) || 1);
  const intervalMinutes = Math.max(1, Number(input.interval_minutes) || 1);
  const pipelinesJson = String(input.pipelines_json || "[]");
  const autoWithoutConfirmation = input.auto_without_confirmation ? 1 : 0;
  const status = String(input.status || "scheduled").trim();
  const details = input.details == null ? null : String(input.details);

  upsertDailyRunStmt.run({
    day_key: dayKey,
    posts_requested: postsRequested,
    interval_minutes: intervalMinutes,
    pipelines_json: pipelinesJson,
    auto_without_confirmation: autoWithoutConfirmation,
    status,
    details,
  });

  return getDailyScheduleRunByDay(dayKey);
}

// V2 Posts functions (for Electron app)

const createPostV2Stmt = db.prepare(`
  INSERT INTO posts_v2 (content, status, type, scheduled_at, source_url)
  VALUES (@content, @status, @type, @scheduled_at, @source_url)
`);

const getPostV2Stmt = db.prepare(`
  SELECT id, content, status, type, scheduled_at, posted_at, error, source_url, created_at, updated_at
  FROM posts_v2
  WHERE id = ?
`);

const listPostsV2Stmt = db.prepare(`
  SELECT id, content, status, type, scheduled_at, posted_at, error, source_url, created_at, updated_at
  FROM posts_v2
  ORDER BY created_at DESC
`);

const listScheduledPostsV2Stmt = db.prepare(`
  SELECT id, content, status, type, scheduled_at, posted_at, error, source_url, created_at, updated_at
  FROM posts_v2
  WHERE status IN ('pending', 'scheduled')
  ORDER BY scheduled_at ASC
`);

const updatePostV2Stmt = db.prepare(`
  UPDATE posts_v2
  SET content = @content,
      status = @status,
      type = @type,
      scheduled_at = @scheduled_at,
      posted_at = @posted_at,
      error = @error,
      source_url = @source_url,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const deletePostV2Stmt = db.prepare(`
  DELETE FROM posts_v2
  WHERE id = ?
`);

function createPostV2(input) {
  if (!input.content || !String(input.content).trim()) {
    throw new Error("Post content is required");
  }

  const result = createPostV2Stmt.run({
    content: String(input.content).trim(),
    status: input.status || "pending",
    type: input.type || "manual",
    scheduled_at: input.scheduled_at || null,
    source_url: input.source_url || null,
  });

  return getPostV2ById(result.lastInsertRowid);
}

function getPostV2ById(id) {
  return getPostV2Stmt.get(id) || null;
}

function listPostsV2() {
  return listPostsV2Stmt.all();
}

function listScheduledPostsV2() {
  return listScheduledPostsV2Stmt.all();
}

function updatePostV2(id, input) {
  const existing = getPostV2ById(id);
  if (!existing) {
    throw new Error(`Post ${id} not found`);
  }

  updatePostV2Stmt.run({
    id,
    content: input.content ?? existing.content,
    status: input.status ?? existing.status,
    type: input.type ?? existing.type,
    scheduled_at: Object.prototype.hasOwnProperty.call(input, "scheduled_at") ? input.scheduled_at : existing.scheduled_at,
    posted_at: Object.prototype.hasOwnProperty.call(input, "posted_at") ? input.posted_at : existing.posted_at,
    error: input.error ?? existing.error,
    source_url: input.source_url ?? existing.source_url,
  });

  return getPostV2ById(id);
}

function deletePostV2(id) {
  deletePostV2Stmt.run(id);
}

function markPostV2AsScheduled(id, scheduledAt) {
  return updatePostV2(id, { status: "scheduled", scheduled_at: scheduledAt });
}

function markPostV2AsPosted(id) {
  return updatePostV2(id, { status: "posted", posted_at: new Date().toISOString() });
}

function markPostV2AsFailed(id, errorMessage) {
  return updatePostV2(id, { status: "failed", error: String(errorMessage || "Unknown error") });
}

// Trial info functions

const getTrialInfoStmt = db.prepare(`
  SELECT id, install_date, posts_count
  FROM trial_info
  WHERE id = 1
`);

const createTrialInfoStmt = db.prepare(`
  INSERT INTO trial_info (id, posts_count)
  VALUES (1, 0)
`);

const incrementTrialPostCountStmt = db.prepare(`
  UPDATE trial_info
  SET posts_count = posts_count + 1
  WHERE id = 1
`);

function getOrCreateTrialInfo() {
  let trialInfo = getTrialInfoStmt.get();
  if (!trialInfo) {
    createTrialInfoStmt.run();
    trialInfo = getTrialInfoStmt.get();
  }
  return trialInfo;
}

function incrementTrialPostCount() {
  getOrCreateTrialInfo();
  incrementTrialPostCountStmt.run();
}

module.exports = {
  db,
  // V2 Posts functions
  createPostV2,
  getPostV2ById,
  listPostsV2,
  updatePostV2,
  deletePostV2,
  listScheduledPostsV2,
  markPostV2AsScheduled,
  markPostV2AsPosted,
  markPostV2AsFailed,
  // Trial functions
  getOrCreateTrialInfo,
  incrementTrialPostCount,
  // Legacy functions
  addPost,
  getSetting,
  setSetting,
  getDailyScheduleRunByDay,
  upsertDailyScheduleRun,
  clearApprovalState,
  createPost,
  deletePost,
  getNextPendingPost,
  getLatestPost,
  getPostBySourceReference,
  getLatestWebContextBySource,
  getWebContextBySourceAndDate,
  getPostById,
  listPosts,
  listRecentPostContents,
  listPendingApprovalPosts,
  markApprovalEmailSent,
  markEmailApproved,
  markPosted,
  markFailed,
  upsertWebContext,
  updatePost,
};
