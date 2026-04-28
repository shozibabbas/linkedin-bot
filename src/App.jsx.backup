import React, { useEffect, useState } from "react";

const emptyForm = {
  content: "",
  status: "pending",
  posted_at: "",
  error: "",
};

const statusOptions = ["pending", "posted", "failed"];

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function toInputDateTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

export default function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [postingMode, setPostingMode] = useState("confirm_email");
  const [modeLoading, setModeLoading] = useState(false);
  const [modeSaved, setModeSaved] = useState(false);
  const [pipelines, setPipelines] = useState([]);
  const [pipelineLoadingKey, setPipelineLoadingKey] = useState("");
  const [pipelineGeneratingKey, setPipelineGeneratingKey] = useState("");
  const [dailySaving, setDailySaving] = useState(false);
  const [dailyRunLoading, setDailyRunLoading] = useState(false);
  const [dailyWizard, setDailyWizard] = useState({
    enabled: false,
    defaultPostsPerDay: 4,
    autoWithoutConfirmation: false,
    generationPipelineKeys: ["work_context"],
    continuePipelineKeys: [],
    remainingMinutesBeforeEndOfDay: 0,
    todayRun: null,
  });

  async function loadPosts() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/posts");
      setPosts(data.posts);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const [settingsData, pipelinesData, dailyData] = await Promise.all([
        apiRequest("/api/settings"),
        apiRequest("/api/pipelines"),
        apiRequest("/api/daily-scheduler"),
      ]);
      setPostingMode(settingsData.settings.posting_mode);
      setPipelines(pipelinesData.pipelines);
      setDailyWizard((current) => ({ ...current, ...dailyData.dailyScheduler }));
    } catch (_) {
      // non-critical, keep default
    }
  }

  useEffect(() => {
    loadPosts();
    loadSettings();
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
  }

  function startEdit(post) {
    setEditingId(post.id);
    setForm({
      content: post.content,
      status: post.status,
      posted_at: toInputDateTime(post.posted_at),
      error: post.error || "",
    });
    setError("");
    setNotice("");
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const body = {
      content: form.content,
      status: form.status,
      posted_at: form.posted_at ? new Date(form.posted_at).toISOString() : null,
      error: form.error || null,
    };

    try {
      if (editingId === null) {
        await apiRequest("/api/posts", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest(`/api/posts/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }

      startCreate();
      await loadPosts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(`Delete post #${id}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/posts/${id}`, { method: "DELETE" });
      await loadPosts();
      if (editingId === id) {
        startCreate();
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleGeneratePipeline(pipelineKey) {
    setPipelineGeneratingKey(pipelineKey);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest("/api/posts/generate", {
        method: "POST",
        body: JSON.stringify({ pipeline: pipelineKey }),
      });

      if (!data.post) {
        setNotice("That pipeline had no fresh content to generate right now.");
        return;
      }

      setNotice(`Generated a new post from ${pipelines.find((pipeline) => pipeline.key === pipelineKey)?.name || pipelineKey}.`);
      await loadPosts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPipelineGeneratingKey("");
    }
  }

  async function handleModeChange(mode) {
    setPostingMode(mode);
    setModeLoading(true);
    setModeSaved(false);
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ posting_mode: mode }),
      });
      setModeSaved(true);
      setTimeout(() => setModeSaved(false), 2000);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setModeLoading(false);
    }
  }

  async function handlePipelineToggle(pipelineKey, enabled) {
    setPipelineLoadingKey(pipelineKey);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(`/api/pipelines/${pipelineKey}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      setPipelines((current) => current.map((pipeline) => (pipeline.key === pipelineKey ? data.pipeline : pipeline)));
    } catch (requestError) {
      setError(requestError.message);
      await loadSettings();
    } finally {
      setPipelineLoadingKey("");
    }
  }

  function updateDailyWizardField(key, value) {
    setDailyWizard((current) => ({ ...current, [key]: value }));
  }

  function togglePipelineKeyInField(field, key, checked) {
    setDailyWizard((current) => {
      const currentValues = Array.isArray(current[field]) ? current[field] : [];
      const nextValues = checked ? [...new Set([...currentValues, key])] : currentValues.filter((entry) => entry !== key);
      return { ...current, [field]: nextValues };
    });
  }

  async function saveDailySchedulerSettings() {
    setDailySaving(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest("/api/daily-scheduler", {
        method: "PUT",
        body: JSON.stringify({
          enabled: dailyWizard.enabled,
          defaultPostsPerDay: dailyWizard.defaultPostsPerDay,
          autoWithoutConfirmation: dailyWizard.autoWithoutConfirmation,
          generationPipelineKeys: dailyWizard.generationPipelineKeys,
          continuePipelineKeys: dailyWizard.continuePipelineKeys,
        }),
      });
      setDailyWizard((current) => ({ ...current, ...data.dailyScheduler }));
      setNotice("Daily scheduler settings saved.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDailySaving(false);
    }
  }

  async function runDailyWizardNow() {
    setDailyRunLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest("/api/daily-scheduler/run", {
        method: "POST",
        body: JSON.stringify({
          postsPerDay: dailyWizard.defaultPostsPerDay,
          autoWithoutConfirmation: dailyWizard.autoWithoutConfirmation,
          pipelineKeys: dailyWizard.generationPipelineKeys,
          saveAsDefaults: true,
        }),
      });
      const scheduledCount = data.result?.scheduled?.length || 0;
      setNotice(`Daily wizard scheduled ${scheduledCount} posts for today.`);
      await Promise.all([loadPosts(), loadSettings()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDailyRunLoading(false);
    }
  }

  const pendingCount = posts.filter((post) => post.status === "pending").length;
  const postedCount = posts.filter((post) => post.status === "posted").length;
  const failedCount = posts.filter((post) => post.status === "failed").length;
  const calculatedIntervalMinutes = dailyWizard.defaultPostsPerDay <= 1
    ? 0
    : Math.max(
      1,
      Math.floor(Math.max(0, (dailyWizard.remainingMinutesBeforeEndOfDay || 0) - 2) / (dailyWizard.defaultPostsPerDay - 1))
    );

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LinkedIn Bot</p>
          <h1>Post Queue Control Room</h1>
          <p className="lede">Review, edit, insert, and remove queued LinkedIn posts backed by the same SQLite database used by the scheduler.</p>
        </div>
        <div className="stats">
          <div>
            <span>Pending</span>
            <strong>{pendingCount}</strong>
          </div>
          <div>
            <span>Posted</span>
            <strong>{postedCount}</strong>
          </div>
          <div>
            <span>Failed</span>
            <strong>{failedCount}</strong>
          </div>
        </div>
      </header>

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>Automation</h2>
          {modeLoading ? <span className="muted">Saving...</span> : null}
          {modeSaved ? <span className="saved-confirm">Saved</span> : null}
        </div>
        <div className="settings-stack">
          <div>
            <h3 className="settings-subtitle">Posting Mode</h3>
            <p className="muted settings-copy">This applies to every enabled pipeline.</p>
          </div>
        <div className="mode-options">
          <label className={`mode-option${postingMode === "confirm_email" ? " mode-option--active" : ""}`}>
            <input
              type="radio"
              name="posting_mode"
              value="confirm_email"
              checked={postingMode === "confirm_email"}
              onChange={() => handleModeChange("confirm_email")}
            />
            <div>
              <strong>Email confirmation</strong>
              <p>When a pipeline creates a post, it emails you for approval. Posting waits for your email reply.</p>
            </div>
          </label>
          <label className={`mode-option${postingMode === "confirm_push" ? " mode-option--active" : ""}`}>
            <input
              type="radio"
              name="posting_mode"
              value="confirm_push"
              checked={postingMode === "confirm_push"}
              onChange={() => handleModeChange("confirm_push")}
            />
            <div>
              <strong>Push notification confirmation</strong>
              <p>When a pipeline creates a post, it sends a Mac push notification. Click it to approve and post.</p>
            </div>
          </label>
          <label className={`mode-option${postingMode === "auto" ? " mode-option--active" : ""}`}>
            <input
              type="radio"
              name="posting_mode"
              value="auto"
              checked={postingMode === "auto"}
              onChange={() => handleModeChange("auto")}
            />
            <div>
              <strong>Fully automatic</strong>
              <p>No confirmation needed. Each pipeline posts immediately when its cron run produces content, then emails you the result.</p>
            </div>
          </label>
        </div>

          <div className="pipelines-head">
            <div>
              <h3 className="settings-subtitle">Content Pipelines</h3>
              <p className="muted settings-copy">Turn pipelines on or off independently. Disabled pipelines stay visible in the portal but stop generating scheduled content.</p>
            </div>
          </div>

          <div className="pipeline-list">
            {pipelines.map((pipeline) => {
              const isBusy = pipelineLoadingKey === pipeline.key;
              const isGenerating = pipelineGeneratingKey === pipeline.key;

              return (
                <article key={pipeline.key} className={`pipeline-card${pipeline.enabled ? " pipeline-card--enabled" : ""}`}>
                  <div className="pipeline-card__top">
                    <div>
                      <h4>{pipeline.name}</h4>
                      <p>{pipeline.description}</p>
                    </div>
                    <label className="switch-row">
                      <span>{pipeline.enabled ? "On" : "Off"}</span>
                      <input
                        type="checkbox"
                        checked={pipeline.enabled}
                        onChange={(event) => handlePipelineToggle(pipeline.key, event.target.checked)}
                        disabled={isBusy}
                      />
                    </label>
                  </div>
                  <div className="pipeline-card__meta">
                    <span className="badge badge-pipeline">{pipeline.cadenceLabel}</span>
                    <span className="muted">Cron: {pipeline.cron}</span>
                  </div>
                  <div className="pipeline-card__actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleGeneratePipeline(pipeline.key)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? "Generating..." : "Generate now"}
                    </button>
                    {isBusy ? <span className="muted">Saving...</span> : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="pipelines-head">
            <div>
              <h3 className="settings-subtitle">Daily Scheduler Wizard</h3>
              <p className="muted settings-copy">Schedule all remaining posts for today in one run. This stores your defaults and can auto-run daily without confirmation.</p>
            </div>
          </div>

          <div className="wizard-panel">
            <label className="switch-row">
              <span>Enable daily scheduler wizard mode</span>
              <input
                type="checkbox"
                checked={dailyWizard.enabled}
                onChange={(event) => updateDailyWizardField("enabled", event.target.checked)}
              />
            </label>

            <label className="switch-row">
              <span>Auto post daily without confirmation</span>
              <input
                type="checkbox"
                checked={dailyWizard.autoWithoutConfirmation}
                onChange={(event) => updateDailyWizardField("autoWithoutConfirmation", event.target.checked)}
              />
            </label>

            <div className="form-grid">
              <label>
                Posts per day
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={dailyWizard.defaultPostsPerDay}
                  onChange={(event) => updateDailyWizardField("defaultPostsPerDay", Number(event.target.value) || 1)}
                />
              </label>

              <label>
                Calculated interval between posts (minutes)
                <input
                  type="number"
                  value={calculatedIntervalMinutes}
                  disabled
                />
              </label>
            </div>

            <div>
              <p className="muted wizard-label">Pipelines to use when generating daily posts:</p>
              <div className="wizard-pipeline-grid">
                {pipelines.map((pipeline) => (
                  <label key={`daily-gen-${pipeline.key}`} className="switch-row wizard-pipeline-row">
                    <span>{pipeline.name}</span>
                    <input
                      type="checkbox"
                      checked={dailyWizard.generationPipelineKeys.includes(pipeline.key)}
                      onChange={(event) => togglePipelineKeyInField("generationPipelineKeys", pipeline.key, event.target.checked)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="muted wizard-label">If daily auto mode already scheduled today, still allow these regular pipelines:</p>
              <div className="wizard-pipeline-grid">
                {pipelines.map((pipeline) => (
                  <label key={`daily-continue-${pipeline.key}`} className="switch-row wizard-pipeline-row">
                    <span>{pipeline.name}</span>
                    <input
                      type="checkbox"
                      checked={dailyWizard.continuePipelineKeys.includes(pipeline.key)}
                      onChange={(event) => togglePipelineKeyInField("continuePipelineKeys", pipeline.key, event.target.checked)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <p className="muted">
              Remaining minutes before end of day: {dailyWizard.remainingMinutesBeforeEndOfDay || 0}
              {dailyWizard.todayRun?.status === "scheduled" ? " | Today's posts are already scheduled." : " | Today's posts are not fully scheduled yet."}
            </p>

            <div className="post-actions">
              <button type="button" className="ghost-button" onClick={saveDailySchedulerSettings} disabled={dailySaving || dailyRunLoading}>
                {dailySaving ? "Saving..." : "Save Daily Wizard Settings"}
              </button>
              <button type="button" className="primary-button" onClick={runDailyWizardNow} disabled={dailyRunLoading || dailySaving}>
                {dailyRunLoading ? "Scheduling..." : "Schedule Whole Day Now"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="layout">
        <section className="panel form-panel">
          <div className="panel-head">
            <h2>{editingId === null ? "Create post" : `Edit post #${editingId}`}</h2>
            <div className="post-actions">
              <button type="button" className="ghost-button" onClick={startCreate}>New</button>
              <button type="button" className="primary-button" onClick={() => handleGeneratePipeline("work_context")} disabled={pipelineGeneratingKey === "work_context" || saving}>
                {pipelineGeneratingKey === "work_context" ? "Generating..." : "Generate Work Context Content"}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="editor">
            <label>
              Content
              <textarea
                name="content"
                rows="8"
                value={form.content}
                onChange={handleChange}
                placeholder="Write your LinkedIn post here"
                required
              />
            </label>

            <div className="form-grid">
              <label>
                Status
                <select name="status" value={form.status} onChange={handleChange}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label>
                Posted at
                <input
                  type="datetime-local"
                  name="posted_at"
                  value={form.posted_at}
                  onChange={handleChange}
                />
              </label>
            </div>

            <label>
              Error
              <input
                type="text"
                name="error"
                value={form.error}
                onChange={handleChange}
                placeholder="Optional failure detail"
              />
            </label>

            {error ? <p className="error-banner">{error}</p> : null}
            {notice ? <p className="notice-banner">{notice}</p> : null}

            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : editingId === null ? "Create post" : "Save changes"}
            </button>
          </form>
        </section>

        <section className="panel list-panel">
          <div className="panel-head">
            <h2>Posts</h2>
            <button type="button" className="ghost-button" onClick={loadPosts}>Refresh</button>
          </div>

          {loading ? <p className="muted">Loading posts...</p> : null}
          {!loading && posts.length === 0 ? <p className="muted">No posts in the database yet.</p> : null}

          <div className="post-list">
            {posts.map((post) => (
              <article key={post.id} className="post-card">
                <div className="post-meta">
                  <span className={`badge badge-${post.status}`}>{post.status}</span>
                  {post.source_pipeline ? <span className="badge badge-pipeline">{post.source_pipeline.replace(/_/g, " ")}</span> : null}
                  <span>#{post.id}</span>
                  <span>Created {formatTimestamp(post.created_at)}</span>
                </div>
                <p className="post-content">{post.content}</p>
                <dl className="post-details">
                  <div>
                    <dt>Posted at</dt>
                    <dd>{formatTimestamp(post.posted_at)}</dd>
                  </div>
                  <div>
                    <dt>Error</dt>
                    <dd>{post.error || "-"}</dd>
                  </div>
                  <div>
                    <dt>Pipeline</dt>
                    <dd>{post.source_pipeline || "manual"}</dd>
                  </div>
                </dl>
                <div className="post-actions">
                  <button type="button" className="ghost-button" onClick={() => startEdit(post)}>Edit</button>
                  <button type="button" className="danger-button" onClick={() => handleDelete(post.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
