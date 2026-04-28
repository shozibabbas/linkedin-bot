import React, { useEffect, useState } from "react";

function defaultContext() {
  return { type: "url", value: "", prompt: "" };
}

const TABS = [
  { id: "generation", label: "Generation" },
  { id: "scheduler", label: "Scheduler" },
  { id: "automation", label: "Automation" },
  { id: "contexts", label: "Context Sources" },
  { id: "account", label: "Account" },
];

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("generation");
  const [loginStatus, setLoginStatus] = useState(null);
  const [loginRefreshing, setLoginRefreshing] = useState(false);
  const [restartingSetup, setRestartingSetup] = useState(false);

  const DEFAULT_INSTRUCTIONS = `Write like a real human being, not a robot. Avoid hyphens in the middle of sentences. Use natural, flowing language that sounds like how a thoughtful person actually speaks. Keep sentences varied in length. The post should end with a line that naturally invites the reader to share their perspective or start a conversation — something like a genuine question or a low-friction opening for them to reply. Do not use bullet points or em-dashes as structural devices.`;

  const [openaiKey, setOpenaiKey] = useState("");
  const [storedKeyMasked, setStoredKeyMasked] = useState(false);
  const [generation, setGeneration] = useState({ maxPostWords: 150 });
  const [generationInstructions, setGenerationInstructions] = useState("");
  const [generationProfile, setGenerationProfile] = useState({
    designation: "",
    company: "",
    includeDesignation: false,
    includeCompany: false,
  });
  const [scheduler, setScheduler] = useState({ enabled: true, startTime: "09:00", endTime: "23:59", postsPerDay: 3, autoRun: true });
  const [autoReactor, setAutoReactor] = useState({
    enabled: false,
    autoRun: false,
    feedUrl: "https://www.linkedin.com/feed/",
    likesPerRun: 20,
    unlimited: false,
  });
  const [autoCommenter, setAutoCommenter] = useState({
    enabled: false,
    autoRun: false,
    feedUrl: "https://www.linkedin.com/feed/",
    commentsPerRun: 10,
    unlimited: false,
    cfbrEnabled: true,
    commentInstructions: "Write as a senior software engineer. Be specific and add genuine value. Reference a detail from the post. Never be generic. Sound like a real person, not a bot.",
  });
  const [attribution, setAttribution] = useState({ enabled: true, dailyTime: "14:00" });
  const [workContexts, setWorkContexts] = useState([defaultContext()]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [settings, login] = await Promise.all([
        window.electronAPI?.getSettings(),
        window.electronAPI?.getLoginStatus(),
      ]);

      setStoredKeyMasked(settings?.openaiKey === "***");
      setOpenaiKey("");
      setGeneration(settings?.generation || { maxPostWords: 150 });
      setGenerationInstructions(settings?.generationInstructions || "");
      setGenerationProfile(settings?.generationProfile || {
        designation: "",
        company: "",
        includeDesignation: false,
        includeCompany: false,
      });
      setScheduler(settings?.scheduler || { enabled: true, startTime: "09:00", endTime: "23:59", postsPerDay: 3, autoRun: true });
      setAutoReactor(settings?.autoReactor || {
        enabled: false,
        autoRun: false,
        feedUrl: "https://www.linkedin.com/feed/",
        likesPerRun: 20,
        unlimited: false,
      });
      setAutoCommenter(settings?.autoCommenter || {
        enabled: false,
        autoRun: false,
        feedUrl: "https://www.linkedin.com/feed/",
        commentsPerRun: 10,
        unlimited: false,
        cfbrEnabled: true,
        commentInstructions: "Write as a senior software engineer. Be specific and add genuine value. Reference a detail from the post. Never be generic. Sound like a real person, not a bot.",
      });
      setAttribution(settings?.attribution || { enabled: true, dailyTime: "14:00" });
      setLoginStatus(login || null);

      const contexts = Array.isArray(settings?.workContexts) && settings.workContexts.length > 0
        ? settings.workContexts
        : [defaultContext()];
      setWorkContexts(contexts);
    } catch (e) {
      setError(`Failed to load settings: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (value) => {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
  };

  const formatRelativeTime = (value) => {
    if (!value) return "No saved session yet";
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "Timestamp unavailable";
    const absMinutes = Math.round(Math.abs(Date.now() - timestamp) / 60000);
    if (absMinutes < 1) return "just now";
    if (absMinutes < 60) return `${absMinutes} minute${absMinutes === 1 ? "" : "s"} ago`;
    const absHours = Math.round(absMinutes / 60);
    if (absHours < 24) return `${absHours} hour${absHours === 1 ? "" : "s"} ago`;
    const absDays = Math.round(absHours / 24);
    return `${absDays} day${absDays === 1 ? "" : "s"} ago`;
  };

  const formatBytes = (value) => {
    if (!value) return "0 B";
    if (value < 1024) return `${value} B`;
    const kb = value / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const handleRefreshLogin = async () => {
    try {
      setError(""); setNotice(""); setLoginRefreshing(true);
      await window.electronAPI?.refreshLinkedinLogin();
      const login = await window.electronAPI?.getLoginStatus();
      setLoginStatus(login || null);
      setNotice("LinkedIn login refreshed and session file updated.");
    } catch (e) {
      setError(`Login refresh failed: ${e.message}`);
    } finally {
      setLoginRefreshing(false);
    }
  };

  const handleRunFirstSetupAgain = async () => {
    if (!window.confirm("This will restart onboarding and open the first-time setup wizard now. Continue?")) return;
    try {
      setError(""); setNotice(""); setRestartingSetup(true);
      await window.electronAPI?.resetFirstTimeSetup();
      window.location.reload();
    } catch (e) {
      setError(`Failed to restart setup wizard: ${e.message}`);
    } finally {
      setRestartingSetup(false);
    }
  };

  const updateContext = (index, patch) =>
    setWorkContexts((prev) => prev.map((ctx, i) => (i === index ? { ...ctx, ...patch } : ctx)));

  const addContext = () =>
    setWorkContexts((prev) => [...prev, defaultContext()]);

  const removeContext = (index) =>
    setWorkContexts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [defaultContext()];
    });

  const saveSettings = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      const payload = {
        generation: { maxPostWords: Number(generation.maxPostWords) },
        generationInstructions,
        generationProfile,
        scheduler: { ...scheduler, postsPerDay: Number(scheduler.postsPerDay) },
        autoReactor: { ...autoReactor, likesPerRun: Number(autoReactor.likesPerRun) },
        autoCommenter: { ...autoCommenter, commentsPerRun: Number(autoCommenter.commentsPerRun) },
        attribution,
        workContexts,
      };
      if (openaiKey.trim()) payload.openaiKey = openaiKey.trim();
      await window.electronAPI?.updateSettings(payload);
      setNotice("Settings saved successfully.");
      if (openaiKey.trim()) { setOpenaiKey(""); setStoredKeyMasked(true); }
    } catch (e2) {
      setError(`Save failed: ${e2.message}`);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="panel"><p className="empty-state">Loading settings...</p></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Control Plane</p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure API access, scheduler cadence, and content context sources.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <form onSubmit={saveSettings}>
        {/* Tab bar */}
        <div className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Generation ────────────────────────────────── */}
        {activeTab === "generation" && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">OpenAI</h2>

              <div className="form-row">
                <label>API Key</label>
                <input
                  type="password"
                  placeholder={storedKeyMasked ? "Key stored. Enter new key to replace." : "sk-..."}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                />
              </div>

              <div className="form-row">
                <label>Max Words Per Post</label>
                <input
                  type="number"
                  min="50"
                  max="500"
                  value={generation.maxPostWords}
                  onChange={(e) => setGeneration((prev) => ({ ...prev, maxPostWords: e.target.value }))}
                />
                <p className="page-subtitle" style={{ marginTop: 0, fontSize: "12px" }}>
                  Body words only, hashtags excluded. Default: 150.
                </p>
              </div>

              <h2 className="panel-title" style={{ marginTop: "16px" }}>Author Profile</h2>

              <div className="grid-2">
                <div className="form-row">
                  <label>Designation</label>
                  <input
                    type="text"
                    placeholder="Founder, PM, etc."
                    value={generationProfile.designation}
                    onChange={(e) => setGenerationProfile((prev) => ({ ...prev, designation: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>Company</label>
                  <input
                    type="text"
                    placeholder="Acme Inc"
                    value={generationProfile.company}
                    onChange={(e) => setGenerationProfile((prev) => ({ ...prev, company: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={generationProfile.includeDesignation}
                    onChange={(e) => setGenerationProfile((prev) => ({ ...prev, includeDesignation: e.target.checked }))}
                  />
                  <span className="checkbox-label-text">Include designation in generation context</span>
                </label>
              </div>

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={generationProfile.includeCompany}
                    onChange={(e) => setGenerationProfile((prev) => ({ ...prev, includeCompany: e.target.checked }))}
                  />
                  <span className="checkbox-label-text">Include company in generation context</span>
                </label>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Generation Instructions</h2>
              <p className="page-subtitle">
                Passed to OpenAI on every generation. Leave blank to use the built-in human-voice default.
              </p>
              <div className="form-row" style={{ marginTop: "12px" }}>
                <textarea
                  value={generationInstructions}
                  placeholder={DEFAULT_INSTRUCTIONS}
                  onChange={(e) => setGenerationInstructions(e.target.value)}
                  style={{ minHeight: "220px" }}
                />
              </div>
              {generationInstructions.trim() !== "" && (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                    onClick={() => setGenerationInstructions("")}
                  >
                    Reset to Default
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Scheduler ─────────────────────────────────── */}
        {activeTab === "scheduler" && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">Posting Schedule</h2>

              <div className="grid-2">
                <div className="form-row">
                  <label>Start Time</label>
                  <input
                    type="time"
                    value={scheduler.startTime}
                    onChange={(e) => setScheduler((prev) => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>End Time</label>
                  <input
                    type="time"
                    value={scheduler.endTime}
                    onChange={(e) => setScheduler((prev) => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <label>Posts Per Day</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={scheduler.postsPerDay}
                  onChange={(e) => setScheduler((prev) => ({ ...prev, postsPerDay: e.target.value }))}
                />
              </div>

              <div className="btn-row" style={{ marginTop: "4px" }}>
                <button
                  type="button"
                  className={`btn ${scheduler.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setScheduler((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  Scheduler {scheduler.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  type="button"
                  className={`btn ${scheduler.autoRun ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setScheduler((prev) => ({ ...prev, autoRun: !prev.autoRun }))}
                >
                  Auto Run {scheduler.autoRun ? "On" : "Off"}
                </button>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Attribution</h2>
              <p className="page-subtitle">Daily attribution post time for free/trial mode.</p>

              <div className="form-row" style={{ marginTop: "12px" }}>
                <label>Attribution Time</label>
                <input
                  type="time"
                  value={attribution.dailyTime}
                  onChange={(e) => setAttribution((prev) => ({ ...prev, dailyTime: e.target.value }))}
                />
              </div>

              <div className="btn-row" style={{ marginTop: "4px" }}>
                <button
                  type="button"
                  className={`btn ${attribution.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAttribution((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  Attribution {attribution.enabled ? "On" : "Off"}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ── Automation ─────────────────────────────── */}
        {activeTab === "automation" && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">Auto Reactor</h2>
              <p className="page-subtitle">Auto-like unreacted posts in the feed.</p>

              <div className="form-row" style={{ marginTop: "12px" }}>
                <label>Feed URL</label>
                <input
                  type="url"
                  value={autoReactor.feedUrl}
                  onChange={(e) => setAutoReactor((prev) => ({ ...prev, feedUrl: e.target.value }))}
                  placeholder="https://www.linkedin.com/feed/"
                />
              </div>

              <div className="form-row">
                <label>Reactions Per Run</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  disabled={autoReactor.unlimited}
                  value={autoReactor.likesPerRun}
                  onChange={(e) => setAutoReactor((prev) => ({ ...prev, likesPerRun: e.target.value }))}
                />
              </div>

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={autoReactor.unlimited}
                    onChange={(e) => setAutoReactor((prev) => ({ ...prev, unlimited: e.target.checked }))}
                  />
                  <span className="checkbox-label-text">Unlimited mode</span>
                </label>
              </div>

              <div className="btn-row" style={{ marginTop: "4px" }}>
                <button
                  type="button"
                  className={`btn ${autoReactor.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAutoReactor((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  Auto Reactor {autoReactor.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  type="button"
                  className={`btn ${autoReactor.autoRun ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAutoReactor((prev) => ({ ...prev, autoRun: !prev.autoRun }))}
                >
                  Auto Run {autoReactor.autoRun ? "On" : "Off"}
                </button>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Auto Commenter</h2>
              <p className="page-subtitle">Traverse feed posts and publish short contextual comments.</p>

              <div className="form-row" style={{ marginTop: "12px" }}>
                <label>Feed URL</label>
                <input
                  type="url"
                  value={autoCommenter.feedUrl}
                  onChange={(e) => setAutoCommenter((prev) => ({ ...prev, feedUrl: e.target.value }))}
                  placeholder="https://www.linkedin.com/feed/"
                />
              </div>

              <div className="form-row">
                <label>Comments Per Run</label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  disabled={autoCommenter.unlimited}
                  value={autoCommenter.commentsPerRun}
                  onChange={(e) => setAutoCommenter((prev) => ({ ...prev, commentsPerRun: e.target.value }))}
                />
              </div>

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={autoCommenter.unlimited}
                    onChange={(e) => setAutoCommenter((prev) => ({ ...prev, unlimited: e.target.checked }))}
                  />
                  <span className="checkbox-label-text">Unlimited mode</span>
                </label>
              </div>

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={autoCommenter.cfbrEnabled !== false}
                    onChange={(e) => setAutoCommenter((prev) => ({ ...prev, cfbrEnabled: e.target.checked }))}
                  />
                  <span className="checkbox-label-text">CFBR mode — comment "CFBR" on job posts and posts asking for wider reach</span>
                </label>
              </div>

              <div className="form-row" style={{ marginTop: "10px" }}>
                <label>Comment Instructions</label>
                <textarea
                  rows={4}
                  value={autoCommenter.commentInstructions || ""}
                  onChange={(e) => setAutoCommenter((prev) => ({ ...prev, commentInstructions: e.target.value }))}
                  placeholder="Instructions for the AI when generating comments..."
                  style={{ resize: "vertical" }}
                />
              </div>

              <div className="btn-row" style={{ marginTop: "4px" }}>
                <button
                  type="button"
                  className={`btn ${autoCommenter.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAutoCommenter((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  Auto Commenter {autoCommenter.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  type="button"
                  className={`btn ${autoCommenter.autoRun ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAutoCommenter((prev) => ({ ...prev, autoRun: !prev.autoRun }))}
                >
                  Auto Run {autoCommenter.autoRun ? "On" : "Off"}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ── Context Sources ───────────────────────────── */}
        {activeTab === "contexts" && (
          <section className="panel">
            <h2 className="panel-title">Work Context Sources</h2>
            <p className="page-subtitle">
              Add URLs (including RSS feeds) or text snippets for AI generation context rotation. Add an optional prompt per source to guide tone, audience, and intent.
            </p>

            <div className="list" style={{ marginTop: "14px" }}>
              {workContexts.map((ctx, index) => (
                <div key={`ctx-${index}`} className="list-item">
                  <div className="context-row">
                    <select value={ctx.type} onChange={(e) => updateContext(index, { type: e.target.value })}>
                      <option value="url">URL</option>
                      <option value="text">Text</option>
                    </select>
                    <input
                      value={ctx.value}
                      placeholder={ctx.type === "url" ? "https://example.com/feed" : "Paste reference text"}
                      onChange={(e) => updateContext(index, { value: e.target.value })}
                    />
                    <button type="button" className="btn btn-ghost" onClick={() => removeContext(index)}>Remove</button>
                  </div>
                  <div className="form-row" style={{ marginTop: "10px", marginBottom: 0 }}>
                    <label>Prompt (Optional)</label>
                    <textarea
                      value={ctx.prompt || ""}
                      placeholder="E.g. Position this as content for founders who want more LinkedIn reach."
                      onChange={(e) => updateContext(index, { prompt: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="btn-row" style={{ marginTop: "14px" }}>
              <button type="button" className="btn btn-ghost" onClick={addContext}>Add Context Source</button>
            </div>
          </section>
        )}

        {/* ── Account ───────────────────────────────────── */}
        {activeTab === "account" && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">LinkedIn Login</h2>
              <p className="page-subtitle">
                Refresh your saved LinkedIn session if it is missing or expired before posting.
              </p>

              <div className="list" style={{ marginTop: "12px" }}>
                <div className="list-item">
                  <div className="metric-label">Session Status</div>
                  <div className="metric-value" style={{ fontSize: "20px", marginTop: "4px" }}>
                    {loginStatus?.loggedIn ? "Saved" : "Missing"}
                  </div>
                  <p className="page-subtitle" style={{ marginTop: "10px", marginBottom: 0 }}>
                    Last login: {formatTimestamp(loginStatus?.lastUpdated)}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                    Age: {formatRelativeTime(loginStatus?.lastUpdated)}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                    Session file: {loginStatus?.authPath || "Unavailable"}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                    Session size: {formatBytes(loginStatus?.fileSizeBytes || 0)}
                  </p>
                  {loginStatus?.error && (
                    <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                      Status error: {loginStatus.error}
                    </p>
                  )}
                </div>
              </div>

              <div className="btn-row" style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRefreshLogin}
                  disabled={loginRefreshing}
                >
                  {loginRefreshing ? "Opening LinkedIn Login..." : "Refresh LinkedIn Login"}
                </button>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Setup</h2>
              <p className="page-subtitle">Re-run the first-time setup wizard to reconfigure runtime, login, and defaults from scratch.</p>
              <div className="btn-row" style={{ marginTop: "14px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRunFirstSetupAgain}
                  disabled={restartingSetup}
                >
                  {restartingSetup ? "Restarting Setup..." : "Run First-Time Setup Again"}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ── Save bar (always visible) */}
        <div className="panel" style={{ marginTop: "18px" }}>
          <div className="btn-row">
            <button className="btn btn-primary" type="submit">Save Settings</button>
            <button className="btn btn-ghost" type="button" onClick={loadSettings}>Reload from Disk</button>
          </div>
        </div>
      </form>
    </div>
  );
}
