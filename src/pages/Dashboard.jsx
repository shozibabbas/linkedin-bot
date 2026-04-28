import React, { useEffect, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDay(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getPostDate(post) {
  return asDate(post?.posted_at) || asDate(post?.scheduled_at) || asDate(post?.created_at);
}

function buildTrend(posts, days = 7) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS);
    day.setHours(0, 0, 0, 0);
    rows.push({
      key: dateKey(day),
      label: shortDay(day),
      posted: 0,
      failed: 0,
      scheduled: 0,
      total: 0,
    });
  }

  const map = new Map(rows.map((row) => [row.key, row]));

  for (const post of posts) {
    const d = getPostDate(post);
    if (!d) continue;
    const key = dateKey(d);
    const row = map.get(key);
    if (!row) continue;

    row.total += 1;
    if (post.status === "posted") row.posted += 1;
    if (post.status === "failed") row.failed += 1;
    if (post.status === "scheduled") row.scheduled += 1;
  }

  return rows;
}

function buildLinePoints(series, key, width, height, padding) {
  const max = Math.max(1, ...series.map((d) => d[key] || 0));
  const step = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;

  return series.map((d, index) => {
    const x = padding + index * step;
    const y = height - padding - ((d[key] || 0) / max) * (height - padding * 2);
    return [x, y];
  });
}

function pointsToPolyline(points) {
  return points.map((p) => `${p[0]},${p[1]}`).join(" ");
}

function pointsToArea(points, width, height, padding) {
  if (!points.length) return "";
  const start = `${points[0][0]},${height - padding}`;
  const middle = points.map((p) => `${p[0]},${p[1]}`).join(" ");
  const end = `${points[points.length - 1][0]},${height - padding}`;
  return `${start} ${middle} ${end}`;
}

export default function Dashboard({ onNavigate }) {
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [trialStatus, setTrialStatus] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [loginStatus, setLoginStatus] = useState(null);
  const [autoReactorStatus, setAutoReactorStatus] = useState(null);
  const [autoCommenterStatus, setAutoCommenterStatus] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStatus() {
      try {
        setLoading(true);
        const [scheduler, trial, license, allPosts, reactor, commenter] = await Promise.all([
          window.electronAPI.getSchedulerStatus(),
          window.electronAPI.getTrialStatus(),
          window.electronAPI.getLicenseStatus(),
          window.electronAPI.listPosts(),
          window.electronAPI.getAutoReactorStatus(),
          window.electronAPI.getAutoCommenterStatus(),
        ]);
        const login = await window.electronAPI.getLoginStatus();
        setSchedulerStatus(scheduler);
        setTrialStatus(trial);
        setLicenseStatus(license);
        setLoginStatus(login);
        setPosts(Array.isArray(allPosts) ? allPosts : []);
        setAutoReactorStatus(reactor || null);
        setAutoCommenterStatus(commenter || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, []);

  function handleRunNow() {
    onNavigate?.("scheduler-run");
  }

  async function handleRefreshLogin() {
    try {
      setError("");
      setLoading(true);
      await window.electronAPI.refreshLinkedinLogin();
      const login = await window.electronAPI.getLoginStatus();
      setLoginStatus(login);
    } catch (err) {
      setError(`Login refresh failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="panel">
          <p className="empty-state">Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  const isLicensed = Boolean(licenseStatus?.licensed);
  const daysRemaining = trialStatus?.daysRemaining || 0;
  const isInTrial = Boolean(trialStatus?.inTrial) && !isLicensed;
  const isFreeUser = !isLicensed && !isInTrial;
  const planLabel = isLicensed ? "Pro" : isInTrial ? "Trial" : "Free";

  const statusCounts = posts.reduce(
    (acc, post) => {
      const key = String(post?.status || "pending");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { pending: 0, scheduled: 0, posted: 0, failed: 0 }
  );

  const typeCounts = posts.reduce(
    (acc, post) => {
      const key = String(post?.type || "manual");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { manual: 0, generated: 0, attribution: 0 }
  );

  const totalPosts = posts.length;
  const postedCount = statusCounts.posted || 0;

  const trend = buildTrend(posts, 7);
  const reactTrend = Array.isArray(autoReactorStatus?.reactsTrend7d) ? autoReactorStatus.reactsTrend7d : [];
  const weeklyPosted = trend.reduce((sum, row) => sum + row.posted, 0);
  const avgDailyPosted = weeklyPosted / Math.max(1, trend.length);
  const totalReacts = Number(autoReactorStatus?.totalReacts || 0);
  const weeklyReacts = reactTrend.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const reactPeak = Math.max(1, ...reactTrend.map((row) => Number(row.count) || 0));
  const commentTrend = Array.isArray(autoCommenterStatus?.commentsTrend7d) ? autoCommenterStatus.commentsTrend7d : [];
  const totalComments = Number(autoCommenterStatus?.totalComments || 0);
  const weeklyComments = commentTrend.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const commentPeak = Math.max(1, ...commentTrend.map((row) => Number(row.count) || 0));
  const automationScore = weeklyReacts + weeklyComments;
  const autoReactorMode = autoReactorStatus?.running ? "Live" : autoReactorStatus?.enabled ? "Armed" : "Off";
  const autoCommenterMode = autoCommenterStatus?.running ? "Live" : autoCommenterStatus?.enabled ? "Armed" : "Off";

  const chartWidth = 520;
  const chartHeight = 210;
  const chartPadding = 18;
  const postedPoints = buildLinePoints(trend, "posted", chartWidth, chartHeight, chartPadding);
  const scheduledPoints = buildLinePoints(trend, "scheduled", chartWidth, chartHeight, chartPadding);
  const postedMax = Math.max(1, ...trend.map((d) => d.posted));

  const latestPost = posts[0] || null;
  const latestPostDate = latestPost ? getPostDate(latestPost) : null;
  const nextRunText = schedulerStatus?.nextRun ? new Date(schedulerStatus.nextRun).toLocaleString() : "N/A";

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Operations Command</p>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Live command center for posting velocity, scheduler health, and account readiness.</p>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="dashboard-hero" style={{ marginBottom: "18px" }}>
        <div>
          <div className="metric-label">Workspace Health</div>
          <h2 className="dashboard-hero-title">
            {schedulerStatus?.enabled ? "Scheduler Armed" : "Scheduler Paused"}
          </h2>
          <p className="page-subtitle" style={{ marginTop: "8px" }}>
            Plan: {planLabel} · Next scheduler cycle: {nextRunText}
          </p>
          <div className="btn-row" style={{ marginTop: "14px" }}>
            <button className="btn btn-primary" onClick={handleRunNow}>Run Scheduler Now</button>
            <button className="btn btn-ghost" onClick={() => onNavigate?.("auto-reactor")}>Open Auto Reactor</button>
            <button className="btn btn-ghost" onClick={() => onNavigate?.("auto-commenter")}>Open Auto Commenter</button>
          </div>
        </div>

        <div className="dashboard-spark-grid">
          <div className="spark-tile">
            <div className="metric-label">7D Posted</div>
            <div className="metric-value">{weeklyPosted}</div>
          </div>
          <div className="spark-tile">
            <div className="metric-label">Posts / Day</div>
            <div className="metric-value">{avgDailyPosted.toFixed(1)}</div>
          </div>
          <div className="spark-tile">
            <div className="metric-label">LinkedIn Auth</div>
            <div className="metric-value" style={{ fontSize: "18px" }}>{loginStatus?.loggedIn ? "Saved" : "Missing"}</div>
          </div>
          <div className="spark-tile spark-tile-accent">
            <div className="metric-label">Automation Events</div>
            <div className="metric-value">{automationScore}</div>
          </div>
        </div>
      </section>

      <section className="dashboard-kpi-grid" style={{ marginBottom: "18px" }}>
        <div className="kpi-card">
          <div className="metric-label">Total Posts</div>
          <div className="kpi-value">{totalPosts}</div>
          <div className="kpi-sub">All-time content items in queue/history</div>
        </div>
        <div className="kpi-card">
          <div className="metric-label">Total Reacts</div>
          <div className="kpi-value">{totalReacts}</div>
          <div className="kpi-sub">All-time reactions sent by Auto Reactor</div>
        </div>
        <div className="kpi-card kpi-card-commenter">
          <div className="metric-label">Total Comments</div>
          <div className="kpi-value">{totalComments}</div>
          <div className="kpi-sub">All-time comments sent by Auto Commenter</div>
        </div>
      </section>

      <section className="dashboard-automation-grid" style={{ marginBottom: "18px" }}>
        <section className="panel automation-panel automation-panel-reactor">
          <div className="automation-head">
            <div>
              <p className="metric-label">Automation Surface</p>
              <h2 className="panel-title" style={{ marginTop: 0 }}>Auto Reactor</h2>
            </div>
            <span className={`automation-badge ${autoReactorStatus?.running ? "is-live" : autoReactorStatus?.enabled ? "is-armed" : "is-off"}`}>
              {autoReactorMode}
            </span>
          </div>

          <div className="automation-stat-grid">
            <div className="automation-stat-card">
              <span className="metric-label">7D Reacts</span>
              <strong>{weeklyReacts}</strong>
            </div>
            <div className="automation-stat-card">
              <span className="metric-label">Peak Day</span>
              <strong>{reactPeak}</strong>
            </div>
            <div className="automation-stat-card">
              <span className="metric-label">Per Run</span>
              <strong>{autoReactorStatus?.unlimited ? "∞" : Number(autoReactorStatus?.likesPerRun || 0)}</strong>
            </div>
          </div>

          <p className="page-subtitle" style={{ marginTop: "12px" }}>
            {autoReactorStatus?.lastStopReason || "Auto-like qualified feed posts with visible runtime pacing and performance history."}
          </p>

          <div className="btn-row" style={{ marginTop: "12px" }}>
            <button className="btn btn-primary" onClick={() => onNavigate?.("auto-reactor")}>Open Auto Reactor</button>
          </div>
        </section>

        <section className="panel automation-panel automation-panel-commenter">
          <div className="automation-head">
            <div>
              <p className="metric-label">Automation Surface</p>
              <h2 className="panel-title" style={{ marginTop: 0 }}>Auto Commenter</h2>
            </div>
            <span className={`automation-badge ${autoCommenterStatus?.running ? "is-live" : autoCommenterStatus?.enabled ? "is-armed" : "is-off"}`}>
              {autoCommenterMode}
            </span>
          </div>

          <div className="automation-stat-grid">
            <div className="automation-stat-card">
              <span className="metric-label">7D Comments</span>
              <strong>{weeklyComments}</strong>
            </div>
            <div className="automation-stat-card">
              <span className="metric-label">Peak Day</span>
              <strong>{commentPeak}</strong>
            </div>
            <div className="automation-stat-card">
              <span className="metric-label">Per Run</span>
              <strong>{autoCommenterStatus?.unlimited ? "∞" : Number(autoCommenterStatus?.commentsPerRun || 0)}</strong>
            </div>
          </div>

          <div className="type-chip-row" style={{ marginTop: "12px" }}>
            <span className="chip">CFBR: {autoCommenterStatus?.cfbrEnabled === false ? "Off" : "On"}</span>
            <span className="chip">Auto Run: {autoCommenterStatus?.autoRun ? "On" : "Off"}</span>
          </div>

          <p className="page-subtitle" style={{ marginTop: "12px" }}>
            {autoCommenterStatus?.lastStopReason || "Context-aware commenting with configurable instructions and CFBR fallback for reach-heavy posts."}
          </p>

          <div className="btn-row" style={{ marginTop: "12px" }}>
            <button className="btn btn-primary" onClick={() => onNavigate?.("auto-commenter")}>Open Auto Commenter</button>
          </div>
        </section>
      </section>

      <section className="panel" style={{ marginBottom: "18px" }}>
          <h2 className="panel-title">Posting Trend (7 Days)</h2>
          <p className="page-subtitle" style={{ marginBottom: "12px" }}>Posted vs scheduled throughput by day.</p>

          <div className="chart-shell">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="line-chart" role="img" aria-label="7 day posting trend">
              <polyline className="line-area" points={pointsToArea(postedPoints, chartWidth, chartHeight, chartPadding)} />
              <polyline className="line-path posted" points={pointsToPolyline(postedPoints)} />
              <polyline className="line-path scheduled" points={pointsToPolyline(scheduledPoints)} />
              {postedPoints.map((point, index) => (
                <circle key={`p-${index}`} cx={point[0]} cy={point[1]} r="3" className="line-dot" />
              ))}
            </svg>

            <div className="chart-xlabels">
              {trend.map((row) => (
                <span key={row.key}>{row.label}</span>
              ))}
            </div>
          </div>

          <div className="chart-legend">
            <span><i className="legend-swatch posted" /> Posted</span>
            <span><i className="legend-swatch scheduled" /> Scheduled</span>
            <span>Max/day: {postedMax}</span>
          </div>
      </section>

      <section className="panel" style={{ marginBottom: "18px" }}>
          <h2 className="panel-title">Pipeline Mix</h2>
          <p className="page-subtitle" style={{ marginBottom: "12px" }}>Status distribution and content source type split.</p>

          <div className="bars-stack">
            {[
              { label: "Pending", value: statusCounts.pending || 0, className: "pending" },
              { label: "Scheduled", value: statusCounts.scheduled || 0, className: "scheduled" },
              { label: "Posted", value: statusCounts.posted || 0, className: "posted" },
              { label: "Failed", value: statusCounts.failed || 0, className: "failed" },
            ].map((item) => {
              const barMax = Math.max(1, totalPosts);
              const width = `${Math.max(6, (item.value / barMax) * 100)}%`;
              return (
                <div className="bar-row" key={item.label}>
                  <span className="bar-label">{item.label}</span>
                  <div className="bar-track">
                    <div className={`bar-fill ${item.className}`} style={{ width }} />
                  </div>
                  <span className="bar-value">{item.value}</span>
                </div>
              );
            })}
          </div>

          <div className="type-chip-row" style={{ marginTop: "14px" }}>
            <span className="chip">Manual: {typeCounts.manual || 0}</span>
            <span className="chip">Generated: {typeCounts.generated || 0}</span>
            <span className="chip">Attribution: {typeCounts.attribution || 0}</span>
          </div>

          <div style={{ marginTop: "16px" }}>
            <h3 className="metric-label" style={{ margin: 0 }}>Reactions (7 Days)</h3>
            <div className="react-bars" style={{ marginTop: "8px" }}>
              {(reactTrend.length ? reactTrend : trend.map((row) => ({ key: row.key, label: row.label, count: 0 }))).map((row) => {
                const value = Number(row.count) || 0;
                const height = `${Math.max(10, (value / reactPeak) * 100)}%`;
                return (
                  <div className="react-bar-col" key={row.key}>
                    <div className="react-bar-track">
                      <div className="react-bar-fill" style={{ height }} />
                    </div>
                    <div className="react-bar-value">{value}</div>
                    <div className="react-bar-label">{row.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="chart-legend" style={{ marginTop: "10px" }}>
              <span><i className="legend-swatch posted" /> 7D Reacts: {weeklyReacts}</span>
              <span>Peak/day: {reactPeak}</span>
            </div>
          </div>

          <div style={{ marginTop: "18px" }}>
            <h3 className="metric-label" style={{ margin: 0 }}>Comments (7 Days)</h3>
            <div className="react-bars react-bars-commenter" style={{ marginTop: "8px" }}>
              {(commentTrend.length ? commentTrend : trend.map((row) => ({ key: row.key, label: row.label, count: 0 }))).map((row) => {
                const value = Number(row.count) || 0;
                const height = `${Math.max(10, (value / commentPeak) * 100)}%`;
                return (
                  <div className="react-bar-col" key={`comment-${row.key}`}>
                    <div className="react-bar-track">
                      <div className="react-bar-fill react-bar-fill-commenter" style={{ height }} />
                    </div>
                    <div className="react-bar-value">{value}</div>
                    <div className="react-bar-label">{row.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="chart-legend" style={{ marginTop: "10px" }}>
              <span><i className="legend-swatch commenter" /> 7D Comments: {weeklyComments}</span>
              <span>Peak/day: {commentPeak}</span>
            </div>
          </div>
      </section>

      {isInTrial && (
        <section className="hero-highlight" style={{ marginTop: "18px", marginBottom: "18px", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <strong style={{ display: "block", marginBottom: "6px" }}>Full Access During Trial</strong>
            <p style={{ margin: 0 }}>
              Trial remaining: {daysRemaining} day{daysRemaining === 1 ? "" : "s"}. Upgrade early to keep unlimited generation and scheduling continuity.
            </p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => onNavigate?.("license")}>
            Purchase Now
          </button>
        </section>
      )}

      <div className="grid-2" style={{ marginBottom: "18px" }}>
        <section className="panel">
          <h2 className="panel-title">Scheduler + Account</h2>
          <div className="list" style={{ marginTop: "8px" }}>
            <div className="list-item">
              <div className="metric-label">Scheduler</div>
              <div className="metric-value" style={{ fontSize: "19px" }}>{schedulerStatus?.enabled ? "Running" : "Disabled"}</div>
              <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                Active hours: {schedulerStatus?.startTime || "--:--"} - {schedulerStatus?.endTime || "--:--"}
              </p>
              <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                Posts/day target: {schedulerStatus?.postsPerDay || 0}
              </p>
              <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                Next run: {nextRunText}
              </p>
            </div>

            <div className="list-item">
              <div className="metric-label">LinkedIn Login</div>
              <div className="metric-value" style={{ fontSize: "19px" }}>{loginStatus?.loggedIn ? "Saved" : "Missing"}</div>
              <p className="page-subtitle" style={{ marginTop: "6px", marginBottom: 0 }}>
                Last refresh: {loginStatus?.lastUpdated ? new Date(loginStatus.lastUpdated).toLocaleString() : "Never"}
              </p>
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: "12px" }}>
            <button className="btn btn-primary" onClick={handleRunNow}>Run Scheduler Now</button>
            <button className="btn btn-ghost" onClick={handleRefreshLogin}>Refresh LinkedIn Login</button>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Latest Activity</h2>
          {latestPost ? (
            <>
              <div className="metric-label">Most Recent Post</div>
              <div className="metric-value" style={{ fontSize: "18px" }}>
                #{latestPost.id} · {String(latestPost.status || "pending").toUpperCase()}
              </div>
              <p className="page-subtitle" style={{ marginTop: "8px" }}>
                {latestPostDate ? `Time: ${latestPostDate.toLocaleString()}` : "No timestamp available"}
              </p>
              <p className="page-subtitle" style={{ marginTop: "8px" }}>
                Type: {latestPost.type || "manual"}
              </p>
              <p className="page-subtitle" style={{ marginTop: "8px" }}>
                {String(latestPost.content || "").slice(0, 180)}{String(latestPost.content || "").length > 180 ? "..." : ""}
              </p>
            </>
          ) : (
            <p className="empty-state">No posts generated yet. Start by creating one from Posts.</p>
          )}

          <div className="btn-row" style={{ marginTop: "12px" }}>
            <button className="btn btn-primary" onClick={() => onNavigate?.("posts")}>Open Posts</button>
            <button className="btn btn-ghost" onClick={() => onNavigate?.("settings")}>Open Settings</button>
            <button className="btn btn-ghost" onClick={() => onNavigate?.("auto-reactor")}>Open Auto Reactor</button>
            <button className="btn btn-ghost" onClick={() => onNavigate?.("auto-commenter")}>Open Auto Commenter</button>
          </div>
        </section>
      </div>

      {isFreeUser && (
        <section className="hero-highlight" style={{ marginTop: "18px" }}>
          <strong>Free tier limits:</strong> max 2 posts/day, single context source, mandatory attribution.
          <div className="btn-row" style={{ marginTop: "10px" }}>
            <button className="btn btn-primary" onClick={() => onNavigate?.("license")}>Upgrade Plan</button>
          </div>
        </section>
      )}
    </div>
  );
}
