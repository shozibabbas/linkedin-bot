import React, { useState } from 'react';

const SECTIONS = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'generation', label: 'Generating Posts' },
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'contexts', label: 'Context Sources' },
  { id: 'license', label: 'License & Trial' },
];

export default function Tutorials() {
  const [active, setActive] = useState('quickstart');

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Knowledge Base</p>
        <h1 className="page-title">Tutorials</h1>
        <p className="page-subtitle">Everything you need to go from zero to fully automated LinkedIn posting.</p>
      </div>

      <div className="tab-bar">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tab-btn ${active === s.id ? 'is-active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Quick Start ───────────────────────────────────── */}
      {active === 'quickstart' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <h2 className="panel-title">Get Running in 5 Minutes</h2>
            <p className="page-subtitle" style={{ marginBottom: '20px' }}>
              Follow these steps to configure the app, generate your first post, and activate the scheduler.
            </p>
            <ol className="step-list">
              <li className="step-item">
                <div className="step-num">1</div>
                <div className="step-body">
                  <div className="step-title">Add your OpenAI API key</div>
                  <p className="step-desc">
                    Go to <strong>Settings → Generation</strong>. Paste your <code>sk-...</code> key into the <em>API Key</em> field and save. Your key is stored locally — it never leaves your machine.
                  </p>
                  <div className="screen-mock" style={{ marginTop: '12px' }}>
                    <div className="sm-bar">
                      <div className="sm-dot gold" />
                      <div className="sm-dot" />
                      <div className="sm-dot" />
                      <span className="sm-title">Settings → Generation</span>
                    </div>
                    <div className="sm-field">
                      <span className="sm-label">API Key</span>
                      <div className="sm-input">sk-••••••••••••••••••••••••••••••••</div>
                    </div>
                    <div className="sm-field">
                      <span className="sm-label">Max Words Per Post</span>
                      <div className="sm-input">150</div>
                    </div>
                    <div className="sm-btn">Save Settings</div>
                  </div>
                </div>
              </li>

              <li className="step-item">
                <div className="step-num">2</div>
                <div className="step-body">
                  <div className="step-title">Set your author profile</div>
                  <p className="step-desc">
                    In <strong>Settings → Generation → Author Profile</strong>, enter your designation and company. Enable the checkboxes to include them in generation context so AI writes in your voice.
                  </p>
                </div>
              </li>

              <li className="step-item">
                <div className="step-num">3</div>
                <div className="step-body">
                  <div className="step-title">Add at least one context source</div>
                  <p className="step-desc">
                    In <strong>Settings → Context Sources</strong>, add a URL (blog, RSS feed, company page) or paste reference text. This is what the AI reads before writing each post. Add an optional prompt per source to guide tone and audience.
                  </p>
                  <div className="screen-mock" style={{ marginTop: '12px' }}>
                    <div className="sm-bar">
                      <div className="sm-dot cyan" />
                      <div className="sm-dot" />
                      <div className="sm-dot" />
                      <span className="sm-title">Settings → Context Sources</span>
                    </div>
                    <div className="sm-field">
                      <span className="sm-label">Type</span>
                      <div className="sm-input">URL</div>
                    </div>
                    <div className="sm-field">
                      <span className="sm-label">Source URL</span>
                      <div className="sm-input">https://yourblog.com/feed</div>
                    </div>
                    <div className="sm-field">
                      <span className="sm-label">Prompt (optional)</span>
                      <div className="sm-input" style={{ color: '#555' }}>Write for founders who want more reach on LinkedIn.</div>
                    </div>
                  </div>
                </div>
              </li>

              <li className="step-item">
                <div className="step-num">4</div>
                <div className="step-body">
                  <div className="step-title">Generate your first post</div>
                  <p className="step-desc">
                    Open the <strong>Posts</strong> page and click <em>Generate New Post</em>. The AI will fetch one of your context sources and produce a LinkedIn-ready draft. Review, edit if needed, then approve.
                  </p>
                </div>
              </li>

              <li className="step-item">
                <div className="step-num">5</div>
                <div className="step-body">
                  <div className="step-title">Post manually or activate the scheduler</div>
                  <p className="step-desc">
                    Use <em>Post Now</em> to publish immediately, or configure the scheduler in <strong>Settings → Scheduler</strong> to post automatically within your defined time window.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <div className="callout">
            <strong>Tip:</strong> Leave the scheduler enabled with <em>Auto Run</em> on and the app will handle the rest — it picks random windows within your start/end times so posts don't appear robotic.
          </div>
        </div>
      )}

      {/* ── Generating Posts ─────────────────────────────── */}
      {active === 'generation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <h2 className="panel-title">How Post Generation Works</h2>
            <p className="page-subtitle" style={{ marginBottom: '20px' }}>
              The system fetches context, builds a prompt, and calls OpenAI to produce a post that sounds like you.
            </p>
            <ol className="step-list">
              <li className="step-item">
                <div className="step-num">1</div>
                <div className="step-body">
                  <div className="step-title">Context is fetched</div>
                  <p className="step-desc">
                    One of your configured sources (URL, RSS, or plain text) is selected. If it's a URL, the page content is extracted. If it's RSS, the latest entries are read.
                  </p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">2</div>
                <div className="step-body">
                  <div className="step-title">A system prompt is assembled</div>
                  <p className="step-desc">
                    Your <em>Generation Instructions</em>, <em>Author Profile</em> (designation + company if enabled), and the source content are combined into a single prompt. If you left instructions blank, the built-in human-voice default is used.
                  </p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">3</div>
                <div className="step-body">
                  <div className="step-title">OpenAI generates the post</div>
                  <p className="step-desc">
                    The assembled prompt is sent to GPT-4o (or the model configured for your key). The response is trimmed to your <em>Max Words</em> limit and returned as a draft.
                  </p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">4</div>
                <div className="step-body">
                  <div className="step-title">Review and approve</div>
                  <p className="step-desc">
                    Each generated draft lands in the <strong>Posts</strong> queue with a <em>Pending Review</em> status. Edit the text inline if needed, then approve it to let the scheduler pick it up.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="panel">
            <h2 className="panel-title">Customising Generation Output</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="callout">
                <strong>Max Words:</strong> Controls body word count (hashtags excluded). Start at 150 and lower it if posts feel too long for your niche. Values between 100–200 perform best on LinkedIn.
              </div>
              <div className="callout callout-info">
                <strong>Generation Instructions:</strong> This field is passed as the system prompt on every call. Describe your voice, what to avoid, and what engagement hook to end with. Leave it blank to use the built-in human-voice default.
              </div>
              <div className="callout callout-warn">
                <strong>Author Profile:</strong> When designation and company are enabled, AI is more likely to write from a first-person professional perspective rather than a generic thought-leadership angle.
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Scheduler ─────────────────────────────────────── */}
      {active === 'scheduler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <h2 className="panel-title">How the Scheduler Works</h2>
            <p className="page-subtitle" style={{ marginBottom: '20px' }}>
              The scheduler runs as a background service and picks random posting slots within your configured window each day.
            </p>
            <ol className="step-list">
              <li className="step-item">
                <div className="step-num">1</div>
                <div className="step-body">
                  <div className="step-title">Set your daily posting window</div>
                  <p className="step-desc">
                    In <strong>Settings → Scheduler</strong>, set <em>Start Time</em> and <em>End Time</em>. Posts will only be published within this window (e.g. 09:00 – 22:00).
                  </p>
                  <div className="screen-mock" style={{ marginTop: '12px' }}>
                    <div className="sm-bar">
                      <div className="sm-dot gold" />
                      <div className="sm-dot" />
                      <div className="sm-dot" />
                      <span className="sm-title">Settings → Scheduler</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="sm-field">
                        <span className="sm-label">Start Time</span>
                        <div className="sm-input">09:00</div>
                      </div>
                      <div className="sm-field">
                        <span className="sm-label">End Time</span>
                        <div className="sm-input">22:00</div>
                      </div>
                    </div>
                    <div className="sm-field" style={{ marginTop: '10px' }}>
                      <span className="sm-label">Posts Per Day</span>
                      <div className="sm-input">3</div>
                    </div>
                  </div>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">2</div>
                <div className="step-body">
                  <div className="step-title">Enable the scheduler and Auto Run</div>
                  <p className="step-desc">
                    Toggle both <em>Scheduler Enabled</em> and <em>Auto Run On</em>. With both active, the scheduler will automatically generate and post content from your approved queue without any manual action.
                  </p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">3</div>
                <div className="step-body">
                  <div className="step-title">Keep a buffer of approved posts</div>
                  <p className="step-desc">
                    The scheduler only publishes posts with <em>Approved</em> status. Make sure there are enough approved drafts in your Posts queue to cover your daily quota. If the queue runs empty, no posts are skipped — they resume when new approved drafts are available.
                  </p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">4</div>
                <div className="step-body">
                  <div className="step-title">Monitor posting history on the Dashboard</div>
                  <p className="step-desc">
                    The Dashboard shows today's post count, last post time, and scheduler status. If a post fails, the reason is logged in the Posts page.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <div className="callout callout-warn">
            <strong>Keep the app running:</strong> The scheduler is an in-process timer — it only fires while the app is open. For unattended posting, leave the app open in the background or start it via <code>npm run scheduler</code> in headless mode.
          </div>
        </div>
      )}

      {/* ── Context Sources ───────────────────────────────── */}
      {active === 'contexts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <h2 className="panel-title">What Are Context Sources?</h2>
            <p className="step-desc">
              Context sources are the raw material the AI reads before writing each post. Think of them as a curated reading list that keeps your content grounded in real ideas from your world — not generic LinkedIn advice.
            </p>
          </section>

          <section className="panel">
            <h2 className="panel-title">Supported Source Types</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
              <div className="callout">
                <strong>URL</strong> — Any web page: blog posts, product pages, news articles, competitor pages. The app fetches and parses the visible text before passing it to the prompt.
              </div>
              <div className="callout callout-info">
                <strong>RSS Feed</strong> — Enter a feed URL (ending in <code>/feed</code> or <code>/rss</code>). The latest 3 entries are read on each generation cycle, keeping output fresh automatically.
              </div>
              <div className="callout">
                <strong>Plain Text</strong> — Paste any text directly: a product brief, a job description, a pitch deck paragraph. Great for evergreen brand-voice material.
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Per-Source Prompts</h2>
            <p className="step-desc" style={{ marginBottom: '14px' }}>
              Each source accepts an optional <em>Prompt</em> field. This is appended to the system prompt when that source is selected, letting you tailor tone and audience per source without changing your global Generation Instructions.
            </p>
            <div className="screen-mock">
              <div className="sm-bar">
                <div className="sm-dot gold" />
                <div className="sm-dot" />
                <div className="sm-dot" />
                <span className="sm-title">Context Source — Per-source Prompt</span>
              </div>
              <div className="sm-field">
                <span className="sm-label">Prompt (optional)</span>
                <div className="sm-input" style={{ color: '#aaa', fontStyle: 'italic' }}>
                  "Position this as a founder's insight for early-stage startup teams who are scaling their GTM."
                </div>
              </div>
            </div>
          </section>

          <div className="callout callout-info">
            <strong>Best practice:</strong> Add 3–5 sources covering your main topics. The system rotates through them, so your posts stay varied across days and don't repeat the same angle.
          </div>
        </div>
      )}

      {/* ── License & Trial ───────────────────────────────── */}
      {active === 'license' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <h2 className="panel-title">Trial vs. Full Access</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="callout">
                <strong>Trial Mode:</strong> You get a set number of AI-generated posts per day (typically 1). Attribution posts are scheduled automatically during trial to disclose the tool under LinkedIn's transparency norms.
              </div>
              <div className="callout callout-info">
                <strong>Full Access:</strong> Activate a license key on the <em>License</em> page to unlock unlimited daily AI posts, remove attribution posts, and unlock advanced scheduler settings.
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Activating a License Key</h2>
            <ol className="step-list">
              <li className="step-item">
                <div className="step-num">1</div>
                <div className="step-body">
                  <div className="step-title">Open the License page</div>
                  <p className="step-desc">Click <strong>License</strong> in the left sidebar.</p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">2</div>
                <div className="step-body">
                  <div className="step-title">Enter your key</div>
                  <p className="step-desc">Paste your license key into the activation field. Keys are validated against the licensing server — you need an internet connection for the first validation.</p>
                </div>
              </li>
              <li className="step-item">
                <div className="step-num">3</div>
                <div className="step-body">
                  <div className="step-title">Activation is cached locally</div>
                  <p className="step-desc">After the first successful validation, the license state is cached so the app works offline. Periodic re-validation happens in the background.</p>
                </div>
              </li>
            </ol>
          </section>

          <div className="callout callout-warn">
            <strong>One device per key.</strong> License keys are tied to a single machine. Contact support if you need to transfer a key to a new device.
          </div>
        </div>
      )}
    </div>
  );
}
