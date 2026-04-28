import React, { useEffect, useState } from "react";

const DEFAULT_CONFIG = {
  enabled: false,
  autoRun: false,
  feedUrl: "https://www.linkedin.com/feed/",
  commentsPerRun: 10,
  unlimited: false,
  cfbrEnabled: true,
  commentInstructions: "Write as a senior software engineer. Be specific and add genuine value. Reference a detail from the post. Never be generic. Sound like a real person, not a bot.",
};

export default function AutoCommenter() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const runtimeStatus = await window.electronAPI?.getAutoCommenterStatus?.();
        if (runtimeStatus) {
          setStatus(runtimeStatus);
        }
      } catch (_error) {
        // Runtime status polling is best-effort.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [settings, runtimeStatus] = await Promise.all([
        window.electronAPI?.getSettings?.(),
        window.electronAPI?.getAutoCommenterStatus?.(),
      ]);

      setConfig(settings?.autoCommenter || DEFAULT_CONFIG);
      setStatus(runtimeStatus || null);
    } catch (e) {
      setError(`Failed to load auto commenter settings: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setBusy(true);
      setError("");
      setNotice("");

      await window.electronAPI?.updateSettings?.({
        autoCommenter: {
          ...config,
          commentsPerRun: Number(config.commentsPerRun),
        },
      });

      setNotice("Auto commenter settings saved.");
      const runtimeStatus = await window.electronAPI?.getAutoCommenterStatus?.();
      setStatus(runtimeStatus || null);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    try {
      setBusy(true);
      setError("");
      setNotice("");

      const result = await window.electronAPI?.runAutoCommenterNow?.();
      const runtimeStatus = await window.electronAPI?.getAutoCommenterStatus?.();
      setStatus(runtimeStatus || null);

      if (result?.ok) {
        setNotice("Auto commenter started. It will traverse your feed and post short contextual comments.");
      } else {
        setError(result?.reason || "Auto commenter run failed.");
      }
    } catch (e) {
      setError(`Auto commenter failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function stopNow() {
    try {
      setBusy(true);
      setError("");
      setNotice("");

      const runtimeStatus = await window.electronAPI?.stopAutoCommenter?.();
      setStatus(runtimeStatus || null);
      setNotice("Auto commenter stop requested.");
    } catch (e) {
      setError(`Failed to stop auto commenter: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="panel">
          <p className="empty-state">Loading auto commenter...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Automation</p>
        <h1 className="page-title">Auto Commenter</h1>
        <p className="page-subtitle">Traverse LinkedIn feed posts and leave short context-aware comments automatically.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <section className="panel">
        <h2 className="panel-title">Configuration</h2>

        <div className="grid-2" style={{ marginTop: "12px" }}>
          <div className="form-row">
            <label>Feed URL</label>
            <input
              type="url"
              value={config.feedUrl}
              onChange={(e) => setConfig((prev) => ({ ...prev, feedUrl: e.target.value }))}
              placeholder="https://www.linkedin.com/feed/"
            />
          </div>

          <div className="form-row">
            <label>Comments Per Run</label>
            <input
              type="number"
              min="1"
              max="300"
              disabled={config.unlimited}
              value={config.commentsPerRun}
              onChange={(e) => setConfig((prev) => ({ ...prev, commentsPerRun: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-row" style={{ marginTop: "4px" }}>
          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={config.unlimited}
              onChange={(e) => setConfig((prev) => ({ ...prev, unlimited: e.target.checked }))}
            />
            <span className="checkbox-label-text">Unlimited mode (run until manually stopped or window closes)</span>
          </label>
        </div>

        <div className="form-row" style={{ marginTop: "4px" }}>
          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={config.cfbrEnabled !== false}
              onChange={(e) => setConfig((prev) => ({ ...prev, cfbrEnabled: e.target.checked }))}
            />
            <span className="checkbox-label-text">CFBR mode — comment "CFBR" on job posts and posts asking for wider reach</span>
          </label>
        </div>

        <div className="form-row" style={{ marginTop: "10px" }}>
          <label>Comment Instructions</label>
          <textarea
            rows={4}
            value={config.commentInstructions || ""}
            onChange={(e) => setConfig((prev) => ({ ...prev, commentInstructions: e.target.value }))}
            placeholder="Instructions for the AI when generating comments..."
            style={{ resize: "vertical" }}
          />
        </div>

        <div className="btn-row" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className={`btn ${config.enabled ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          >
            Auto Commenter {config.enabled ? "Enabled" : "Disabled"}
          </button>

          <button
            type="button"
            className={`btn ${config.autoRun ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConfig((prev) => ({ ...prev, autoRun: !prev.autoRun }))}
          >
            Auto Run {config.autoRun ? "On" : "Off"}
          </button>
        </div>

        <div className="btn-row" style={{ marginTop: "12px" }}>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            Save Settings
          </button>
          <button type="button" className="btn btn-ghost" onClick={load} disabled={busy}>
            Reload
          </button>
        </div>
      </section>

      <section className="panel" style={{ marginTop: "18px" }}>
        <h2 className="panel-title">Runtime</h2>

        <div className="btn-row" style={{ marginTop: "10px" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={runNow}
            disabled={busy || status?.running}
          >
            {busy || status?.running ? "Auto Commenter Running..." : "Run Auto Commenter Now"}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={stopNow}
            disabled={busy || !status?.running}
          >
            Stop Auto Commenter
          </button>
        </div>

        <div className="list" style={{ marginTop: "12px" }}>
          <div className="list-item">
            <div className="metric-label">Runtime Status</div>
            <div className="metric-value" style={{ fontSize: "18px", marginTop: "4px" }}>
              {status?.running ? "Running" : "Idle"}
            </div>
            <p className="page-subtitle" style={{ marginTop: "8px", marginBottom: 0 }}>
              Comments done (last run): {status?.commentsDone || 0}
            </p>
            <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
              Last stop reason: {status?.lastStopReason || "N/A"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
