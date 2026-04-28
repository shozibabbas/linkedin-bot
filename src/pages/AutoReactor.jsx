import React, { useEffect, useState } from "react";

const DEFAULT_CONFIG = {
  enabled: false,
  autoRun: false,
  feedUrl: "https://www.linkedin.com/feed/",
  likesPerRun: 20,
  unlimited: false,
};

export default function AutoReactor() {
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
        const runtimeStatus = await window.electronAPI?.getAutoReactorStatus?.();
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
        window.electronAPI?.getAutoReactorStatus?.(),
      ]);

      setConfig(settings?.autoReactor || DEFAULT_CONFIG);
      setStatus(runtimeStatus || null);
    } catch (e) {
      setError(`Failed to load auto reactor settings: ${e.message}`);
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
        autoReactor: {
          ...config,
          likesPerRun: Number(config.likesPerRun),
        },
      });

      setNotice("Auto reactor settings saved.");
      const runtimeStatus = await window.electronAPI?.getAutoReactorStatus?.();
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

      const result = await window.electronAPI?.runAutoReactorNow?.();
      const runtimeStatus = await window.electronAPI?.getAutoReactorStatus?.();
      setStatus(runtimeStatus || null);

      if (result?.ok) {
        setNotice("Auto reactor started. It will keep reacting until target/unlimited stop conditions are met.");
      } else {
        setError(result?.reason || "Auto reactor run failed.");
      }
    } catch (e) {
      setError(`Auto reactor failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function stopNow() {
    try {
      setBusy(true);
      setError("");
      setNotice("");

      const runtimeStatus = await window.electronAPI?.stopAutoReactor?.();
      setStatus(runtimeStatus || null);
      setNotice("Auto reactor stop requested.");
    } catch (e) {
      setError(`Failed to stop auto reactor: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="panel">
          <p className="empty-state">Loading auto reactor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Automation</p>
        <h1 className="page-title">Auto Reactor</h1>
        <p className="page-subtitle">Auto-like unreacted LinkedIn feed posts with configurable caps and runtime controls.</p>
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
            <label>Reactions Per Run</label>
            <input
              type="number"
              min="1"
              max="500"
              disabled={config.unlimited}
              value={config.likesPerRun}
              onChange={(e) => setConfig((prev) => ({ ...prev, likesPerRun: e.target.value }))}
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

        <div className="btn-row" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className={`btn ${config.enabled ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          >
            Auto Reactor {config.enabled ? "Enabled" : "Disabled"}
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
            {busy || status?.running ? "Auto Reactor Running..." : "Run Auto Reactor Now"}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={stopNow}
            disabled={busy || !status?.running}
          >
            Stop Auto Reactor
          </button>
        </div>

        <div className="list" style={{ marginTop: "12px" }}>
          <div className="list-item">
            <div className="metric-label">Runtime Status</div>
            <div className="metric-value" style={{ fontSize: "18px", marginTop: "4px" }}>
              {status?.running ? "Running" : "Idle"}
            </div>
            <p className="page-subtitle" style={{ marginTop: "8px", marginBottom: 0 }}>
              Likes done (last run): {status?.likesDone || 0}
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