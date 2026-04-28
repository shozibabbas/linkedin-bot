import React, { useEffect, useMemo, useState } from "react";

function defaultContext() {
  return { type: "url", value: "", prompt: "" };
}

export default function FirstRun({ onComplete }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [installingRuntime, setInstallingRuntime] = useState(false);
  const [refreshingLogin, setRefreshingLogin] = useState(false);

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runtimeLog, setRuntimeLog] = useState("");

  const [licenseStatus, setLicenseStatus] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [loginStatus, setLoginStatus] = useState(null);

  const [hasStoredOpenAiKey, setHasStoredOpenAiKey] = useState(false);

  const [trialAccepted, setTrialAccepted] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const DEFAULT_GENERATION_INSTRUCTIONS = "Write like a real human being, not a robot. Avoid hyphens in the middle of sentences. Use natural, flowing language that sounds like how a thoughtful person actually speaks. Keep sentences varied in length. The post should end with a line that naturally invites the reader to share their perspective or start a conversation - something like a genuine question or a low-friction opening for them to reply. Do not use bullet points or em-dashes as structural devices.";
  const DEFAULT_COMMENT_INSTRUCTIONS = "Write as a senior software engineer. Be specific and add genuine value. Reference a detail from the post. Never be generic. Sound like a real person, not a bot.";
  const [setupData, setSetupData] = useState({
    openaiKey: "",
    generation: {
      maxPostWords: 150,
    },
    generationInstructions: "",
    generationProfile: {
      designation: "",
      company: "",
      includeDesignation: false,
      includeCompany: false,
    },
    scheduler: {
      enabled: true,
      startTime: "09:00",
      endTime: "23:59",
      postsPerDay: 3,
      autoRun: true,
    },
    attribution: {
      enabled: true,
      dailyTime: "14:00",
    },
    autoReactor: {
      enabled: false,
      autoRun: false,
      feedUrl: "https://www.linkedin.com/feed/",
      likesPerRun: 20,
      unlimited: false,
    },
    autoCommenter: {
      enabled: false,
      autoRun: false,
      feedUrl: "https://www.linkedin.com/feed/",
      commentsPerRun: 10,
      unlimited: false,
      cfbrEnabled: true,
      commentInstructions: DEFAULT_COMMENT_INSTRUCTIONS,
    },
    workContexts: [defaultContext()],
    playwright: {
      browserMode: "managed",
      browserPath: "",
    },
  });

  const steps = useMemo(() => ([
    "License",
    "Install Runtime",
    "LinkedIn Login",
    "Basic Settings",
    "Automation & Context",
  ]), []);

  useEffect(() => {
    async function loadInitialState() {
      try {
        setLoading(true);
        const [settings, runtime, login, license] = await Promise.all([
          window.electronAPI.getSettings(),
          window.electronAPI.getRuntimeStatus(),
          window.electronAPI.getLoginStatus(),
          window.electronAPI.getLicenseStatus(),
        ]);

        const contexts = Array.isArray(settings?.workContexts) && settings.workContexts.length > 0
          ? settings.workContexts
          : [defaultContext()];

        setSetupData((prev) => ({
          ...prev,
          generation: settings?.generation || prev.generation,
          generationInstructions: settings?.generationInstructions || prev.generationInstructions,
          generationProfile: settings?.generationProfile || prev.generationProfile,
          scheduler: settings?.scheduler || prev.scheduler,
          attribution: settings?.attribution || prev.attribution,
          autoReactor: settings?.autoReactor || prev.autoReactor,
          autoCommenter: settings?.autoCommenter || prev.autoCommenter,
          workContexts: contexts,
          playwright: {
            browserMode: "managed",
            browserPath: "",
          },
        }));

        setHasStoredOpenAiKey(settings?.openaiKey === "***");
        setRuntimeStatus(runtime || null);
        setLoginStatus(login || null);
        setLicenseStatus(license || null);
      } catch (e) {
        setError(`Failed to load setup state: ${e.message}`);
      } finally {
        setLoading(false);
      }
    }

    loadInitialState();
  }, []);

  useEffect(() => {
    const dispose = window.electronAPI.onRuntimeInstallLog((payload) => {
      const text = String(payload?.text || "");
      if (!text) {
        return;
      }

      setRuntimeLog((prev) => `${prev}${text}`);
    });

    return () => {
      dispose?.();
    };
  }, []);

  const updateContext = (index, patch) => {
    setSetupData((prev) => ({
      ...prev,
      workContexts: prev.workContexts.map((ctx, i) => (i === index ? { ...ctx, ...patch } : ctx)),
    }));
  };

  const addContext = () => {
    setSetupData((prev) => ({
      ...prev,
      workContexts: [...prev.workContexts, defaultContext()],
    }));
  };

  const removeContext = (index) => {
    setSetupData((prev) => {
      const next = prev.workContexts.filter((_, i) => i !== index);
      return {
        ...prev,
        workContexts: next.length > 0 ? next : [defaultContext()],
      };
    });
  };

  const activateLicense = async () => {
    if (!licenseKey.trim()) {
      setError("Enter a license key or continue with trial.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setNotice("");
      const result = await window.electronAPI.activateLicense(licenseKey.trim());
      if (!result?.success) {
        throw new Error(result?.error || "Activation failed");
      }
      const latestLicense = await window.electronAPI.getLicenseStatus();
      setLicenseStatus(latestLicense || null);
      setNotice("License activated. Continue to runtime setup.");
    } catch (e) {
      setError(`License activation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const installRuntime = async () => {
    try {
      setInstallingRuntime(true);
      setError("");
      setNotice("");
      setRuntimeLog("[installer] Starting Playwright managed runtime installation...\n");
      const result = await window.electronAPI.installPlaywrightRuntime({});
      if (!result?.output) {
        setRuntimeLog((prev) => `${prev}\n[installer] No additional output returned.\n`);
      }
      const latest = await window.electronAPI.getRuntimeStatus();
      setRuntimeStatus(latest || null);
      setNotice("Playwright runtime installed successfully.");
    } catch (e) {
      setError(`Runtime install failed: ${e.message}`);
    } finally {
      setInstallingRuntime(false);
    }
  };

  const refreshLogin = async () => {
    try {
      setRefreshingLogin(true);
      setError("");
      setNotice("");
      await window.electronAPI.refreshLinkedinLogin();
      const latest = await window.electronAPI.getLoginStatus();
      setLoginStatus(latest || null);
      setNotice("LinkedIn session refreshed.");
    } catch (e) {
      setError(`LinkedIn login refresh failed: ${e.message}`);
    } finally {
      setRefreshingLogin(false);
    }
  };

  const goNext = () => {
    setError("");
    setNotice("");
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => {
    setError("");
    setNotice("");
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const completeSetup = async () => {
    const trimmedKey = setupData.openaiKey.trim();
    const hasOpenAi = hasStoredOpenAiKey || Boolean(trimmedKey);
    if (!hasOpenAi) {
      setError("OpenAI API key is required to complete first-time setup.");
      return;
    }

    const validWorkContexts = setupData.workContexts
      .map((ctx) => ({
        type: ctx.type === "url" ? "url" : "text",
        value: String(ctx.value || "").trim(),
        prompt: String(ctx.prompt || "").trim(),
      }))
      .filter((ctx) => ctx.value);

    if (validWorkContexts.length === 0) {
      setError("Add at least one work context source before completing setup.");
      return;
    }

    if (!/^https:\/\//i.test(String(setupData.autoReactor.feedUrl || "").trim())) {
      setError("Auto Reactor feed URL must be a valid https URL.");
      return;
    }

    if (!/^https:\/\//i.test(String(setupData.autoCommenter.feedUrl || "").trim())) {
      setError("Auto Commenter feed URL must be a valid https URL.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setNotice("");

      const payload = {
        generation: {
          maxPostWords: Number(setupData.generation.maxPostWords),
        },
        generationInstructions: String(setupData.generationInstructions || "").trim(),
        generationProfile: {
          designation: String(setupData.generationProfile.designation || "").trim(),
          company: String(setupData.generationProfile.company || "").trim(),
          includeDesignation: Boolean(setupData.generationProfile.includeDesignation),
          includeCompany: Boolean(setupData.generationProfile.includeCompany),
        },
        scheduler: {
          ...setupData.scheduler,
          postsPerDay: Number(setupData.scheduler.postsPerDay),
        },
        attribution: setupData.attribution,
        autoReactor: {
          ...setupData.autoReactor,
          likesPerRun: Number(setupData.autoReactor.likesPerRun),
          feedUrl: String(setupData.autoReactor.feedUrl || "").trim(),
        },
        autoCommenter: {
          ...setupData.autoCommenter,
          commentsPerRun: Number(setupData.autoCommenter.commentsPerRun),
          feedUrl: String(setupData.autoCommenter.feedUrl || "").trim(),
          commentInstructions: String(setupData.autoCommenter.commentInstructions || "").trim(),
        },
        workContexts: validWorkContexts,
        playwright: {
          browserMode: "managed",
          browserPath: "",
        },
      };

      if (trimmedKey) {
        payload.openaiKey = trimmedKey;
      }

      await window.electronAPI.completeFirstTimeSetup(payload);
      setNotice("Setup complete. Launching workspace...");
      onComplete?.();
    } catch (e) {
      setError(`Failed to complete setup: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <section className="panel" style={{ width: "min(760px, 94vw)" }}>
          <p className="page-kicker">Initial Setup</p>
          <h1 className="page-title">Preparing Wizard</h1>
          <p className="page-subtitle">Loading license, runtime, and settings defaults...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "22px 0" }}>
      <section className="panel" style={{ width: "min(940px, 96vw)" }}>
        <p className="page-kicker">First-Time Setup Wizard</p>
        <h1 className="page-title">Configure LinkedIn Bot</h1>
        <p className="page-subtitle">Step {step + 1} of {steps.length}: {steps[step]}</p>

        <div className="list" style={{ marginTop: "12px", marginBottom: "14px" }}>
          <div className="list-item" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {steps.map((label, index) => (
              <span key={label} className={`chip ${index <= step ? "posted" : "scheduled"}`}>
                {index + 1}. {label}
              </span>
            ))}
          </div>
        </div>

        {error && <div className="error" style={{ marginBottom: "12px" }}>{error}</div>}
        {notice && <div className="notice" style={{ marginBottom: "12px" }}>{notice}</div>}

        {step === 0 && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">License & Trial</h2>
              <p>Choose trial mode or activate your license now.</p>
              <p className="page-subtitle" style={{ marginTop: "8px" }}>
                Status: {licenseStatus?.licensed ? "Licensed" : "Trial/Free"}
              </p>

              <div className="form-row" style={{ marginTop: "12px" }}>
                <label>License Key (Optional)</label>
                <input
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="Paste license key"
                />
              </div>

              <div className="btn-row">
                <button className="btn btn-primary" type="button" onClick={activateLicense} disabled={busy}>
                  {busy ? "Activating..." : "Activate License"}
                </button>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">What Happens Next</h2>
              <p>1. Install Playwright runtime (required).</p>
              <p>2. Login to LinkedIn and save session.</p>
              <p>3. Add OpenAI key and scheduler defaults.</p>
              <p>4. Configure automation/context and complete setup.</p>
            </section>
          </div>
        )}

        {step === 1 && (
          <section className="panel">
            <h2 className="panel-title">Install Playwright Runtime (Required)</h2>
            <p className="page-subtitle">
              This app uses a managed Playwright Chromium runtime. Click the install button below and wait for completion before continuing.
            </p>

            <div className="btn-row" style={{ marginTop: "12px" }}>
              <button className="btn btn-primary" type="button" onClick={installRuntime} disabled={installingRuntime}>
                {installingRuntime ? "Installing Runtime..." : "Install Runtime"}
              </button>
            </div>

            <div className="hero-highlight" style={{ marginTop: "14px" }}>
              <strong>Runtime Status</strong>
              <p style={{ margin: "8px 0 0" }}>{runtimeStatus?.details || "Unknown"}</p>
              <p style={{ margin: "6px 0 0" }}>
                Install check: {runtimeStatus?.browserReady ? "Ready" : "Not installed yet"}
              </p>
            </div>

            {runtimeLog && (
              <textarea readOnly value={runtimeLog} style={{ marginTop: "12px", minHeight: "140px" }} />
            )}
          </section>
        )}

        {step === 2 && (
          <section className="panel">
            <h2 className="panel-title">Login to LinkedIn</h2>
            <p className="page-subtitle">
              Click the button to open LinkedIn login. Complete login and 2FA in the browser window to save your session.
            </p>

            <div className="btn-row" style={{ marginTop: "12px" }}>
              <button className="btn btn-primary" type="button" onClick={refreshLogin} disabled={refreshingLogin}>
                {refreshingLogin ? "Opening Login..." : "Login to LinkedIn"}
              </button>
            </div>

            <div className="hero-highlight" style={{ marginTop: "14px" }}>
              <strong>Login Status</strong>
              <p style={{ margin: "8px 0 0" }}>Saved session: {loginStatus?.loggedIn ? "Available" : "Missing"}</p>
              <p style={{ margin: "6px 0 0" }}>
                Last updated: {loginStatus?.lastUpdated ? new Date(loginStatus.lastUpdated).toLocaleString() : "Never"}
              </p>
              <p style={{ margin: "6px 0 0" }}>Path: {loginStatus?.authPath || "N/A"}</p>
            </div>
          </section>
        )}

        {step === 3 && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">OpenAI Key</h2>
              <p className="page-subtitle">
                {hasStoredOpenAiKey
                  ? "A key is already saved. Enter a new key only if you want to replace it."
                  : "Enter your OpenAI API key to enable AI-generated posts."}
              </p>
              <div className="form-row" style={{ marginTop: "12px" }}>
                <label>OpenAI API Key</label>
                <input
                  type="password"
                  value={setupData.openaiKey}
                  onChange={(e) => setSetupData((prev) => ({ ...prev, openaiKey: e.target.value }))}
                  placeholder="sk-..."
                />
              </div>

              <div className="form-row">
                <label>Max Words Per Post</label>
                <input
                  type="number"
                  min="50"
                  max="500"
                  value={setupData.generation.maxPostWords}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    generation: { ...prev.generation, maxPostWords: e.target.value },
                  }))}
                />
              </div>

              <div className="grid-2" style={{ marginTop: "10px" }}>
                <div className="form-row">
                  <label>Your Designation (Optional)</label>
                  <input
                    type="text"
                    value={setupData.generationProfile.designation}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      generationProfile: { ...prev.generationProfile, designation: e.target.value },
                    }))}
                    placeholder="Founder, Product Manager, etc."
                  />
                </div>
                <div className="form-row">
                  <label>Your Company (Optional)</label>
                  <input
                    type="text"
                    value={setupData.generationProfile.company}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      generationProfile: { ...prev.generationProfile, company: e.target.value },
                    }))}
                    placeholder="Acme Inc"
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: "10px" }}>
                <label>Generation Instructions</label>
                <textarea
                  value={setupData.generationInstructions}
                  placeholder={DEFAULT_GENERATION_INSTRUCTIONS}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    generationInstructions: e.target.value,
                  }))}
                  style={{ minHeight: "140px" }}
                />
              </div>
              {setupData.generationInstructions.trim() !== "" && (
                <div className="btn-row" style={{ marginTop: "6px" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                    onClick={() => setSetupData((prev) => ({ ...prev, generationInstructions: "" }))}
                  >
                    Reset to Default
                  </button>
                </div>
              )}

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={setupData.generationProfile.includeDesignation}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      generationProfile: { ...prev.generationProfile, includeDesignation: e.target.checked },
                    }))}
                  />
                  <span className="checkbox-label-text">Include designation in AI generation context</span>
                </label>
              </div>

              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={setupData.generationProfile.includeCompany}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      generationProfile: { ...prev.generationProfile, includeCompany: e.target.checked },
                    }))}
                  />
                  <span className="checkbox-label-text">Include company in AI generation context</span>
                </label>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Scheduler Defaults</h2>
              <div className="grid-2">
                <div className="form-row">
                  <label>Start Time</label>
                  <input
                    type="time"
                    value={setupData.scheduler.startTime}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      scheduler: { ...prev.scheduler, startTime: e.target.value },
                    }))}
                  />
                </div>
                <div className="form-row">
                  <label>End Time</label>
                  <input
                    type="time"
                    value={setupData.scheduler.endTime}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      scheduler: { ...prev.scheduler, endTime: e.target.value },
                    }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <label>Posts Per Day</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={setupData.scheduler.postsPerDay}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    scheduler: { ...prev.scheduler, postsPerDay: e.target.value },
                  }))}
                />
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className={`btn ${setupData.scheduler.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    scheduler: { ...prev.scheduler, enabled: !prev.scheduler.enabled },
                  }))}
                >
                  Scheduler {setupData.scheduler.enabled ? "Enabled" : "Disabled"}
                </button>

                <button
                  type="button"
                  className={`btn ${setupData.scheduler.autoRun ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    scheduler: { ...prev.scheduler, autoRun: !prev.scheduler.autoRun },
                  }))}
                >
                  Auto Run {setupData.scheduler.autoRun ? "On" : "Off"}
                </button>
              </div>
            </section>
          </div>
        )}

        {step === 4 && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">Work Context Sources</h2>
              <p className="page-subtitle">Add URLs or text context used for generation rotation.</p>
              <div className="list" style={{ marginTop: "12px" }}>
                {setupData.workContexts.map((ctx, index) => (
                  <div key={`ctx-${index}`} className="list-item">
                    <div className="context-row">
                      <select
                        value={ctx.type}
                        onChange={(e) => updateContext(index, { type: e.target.value })}
                      >
                        <option value="url">URL</option>
                        <option value="text">Text</option>
                      </select>
                      <input
                        value={ctx.value}
                        placeholder={ctx.type === "url" ? "https://example.com/feed" : "Paste reference notes"}
                        onChange={(e) => updateContext(index, { value: e.target.value })}
                      />
                      <button type="button" className="btn btn-ghost" onClick={() => removeContext(index)}>Remove</button>
                    </div>
                    <div className="form-row" style={{ marginTop: "10px", marginBottom: 0 }}>
                      <label>Prompt (Optional)</label>
                      <textarea
                        value={ctx.prompt || ""}
                        placeholder="Describe audience/tone/intent for this source."
                        onChange={(e) => updateContext(index, { prompt: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="btn-row" style={{ marginTop: "12px" }}>
                <button type="button" className="btn btn-ghost" onClick={addContext}>Add Context Source</button>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Automation & Attribution</h2>
              <p className="page-subtitle">Configure Auto Reactor, Auto Commenter, and attribution defaults.</p>

              <h3 style={{ marginTop: "12px", marginBottom: "8px", fontSize: "16px" }}>Auto Reactor</h3>
              <div className="form-row">
                <label>Feed URL</label>
                <input
                  type="url"
                  value={setupData.autoReactor.feedUrl}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    autoReactor: { ...prev.autoReactor, feedUrl: e.target.value },
                  }))}
                  placeholder="https://www.linkedin.com/feed/"
                />
              </div>
              <div className="form-row">
                <label>Reactions Per Run</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  disabled={setupData.autoReactor.unlimited}
                  value={setupData.autoReactor.likesPerRun}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    autoReactor: { ...prev.autoReactor, likesPerRun: e.target.value },
                  }))}
                />
              </div>
              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={setupData.autoReactor.unlimited}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      autoReactor: { ...prev.autoReactor, unlimited: e.target.checked },
                    }))}
                  />
                  <span className="checkbox-label-text">Unlimited mode</span>
                </label>
              </div>
              <div className="btn-row" style={{ marginTop: "4px", marginBottom: "10px" }}>
                <button
                  type="button"
                  className={`btn ${setupData.autoReactor.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    autoReactor: { ...prev.autoReactor, enabled: !prev.autoReactor.enabled },
                  }))}
                >
                  Auto Reactor {setupData.autoReactor.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  type="button"
                  className={`btn ${setupData.autoReactor.autoRun ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    autoReactor: { ...prev.autoReactor, autoRun: !prev.autoReactor.autoRun },
                  }))}
                >
                  Auto Run {setupData.autoReactor.autoRun ? "On" : "Off"}
                </button>
              </div>

              <h3 style={{ marginTop: "8px", marginBottom: "8px", fontSize: "16px" }}>Auto Commenter</h3>
              <div className="form-row">
                <label>Feed URL</label>
                <input
                  type="url"
                  value={setupData.autoCommenter.feedUrl}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    autoCommenter: { ...prev.autoCommenter, feedUrl: e.target.value },
                  }))}
                  placeholder="https://www.linkedin.com/feed/"
                />
              </div>
              <div className="form-row">
                <label>Comments Per Run</label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  disabled={setupData.autoCommenter.unlimited}
                  value={setupData.autoCommenter.commentsPerRun}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    autoCommenter: { ...prev.autoCommenter, commentsPerRun: e.target.value },
                  }))}
                />
              </div>
              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={setupData.autoCommenter.unlimited}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      autoCommenter: { ...prev.autoCommenter, unlimited: e.target.checked },
                    }))}
                  />
                  <span className="checkbox-label-text">Unlimited mode</span>
                </label>
              </div>
              <div className="form-row" style={{ marginTop: "4px" }}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={setupData.autoCommenter.cfbrEnabled !== false}
                    onChange={(e) => setSetupData((prev) => ({
                      ...prev,
                      autoCommenter: { ...prev.autoCommenter, cfbrEnabled: e.target.checked },
                    }))}
                  />
                  <span className="checkbox-label-text">CFBR mode for job/boost-reach posts</span>
                </label>
              </div>
              <div className="form-row" style={{ marginTop: "8px" }}>
                <label>Comment Instructions</label>
                <textarea
                  rows={4}
                  value={setupData.autoCommenter.commentInstructions || ""}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    autoCommenter: { ...prev.autoCommenter, commentInstructions: e.target.value },
                  }))}
                  placeholder="Instructions for the AI when generating comments..."
                  style={{ resize: "vertical" }}
                />
              </div>
              {String(setupData.autoCommenter.commentInstructions || "").trim() !== "" && (
                <div className="btn-row" style={{ marginTop: "6px" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                    onClick={() => setSetupData((prev) => ({
                      ...prev,
                      autoCommenter: {
                        ...prev.autoCommenter,
                        commentInstructions: DEFAULT_COMMENT_INSTRUCTIONS,
                      },
                    }))}
                  >
                    Reset Comment Instructions
                  </button>
                </div>
              )}

              <div className="btn-row" style={{ marginTop: "4px", marginBottom: "10px" }}>
                <button
                  type="button"
                  className={`btn ${setupData.autoCommenter.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    autoCommenter: { ...prev.autoCommenter, enabled: !prev.autoCommenter.enabled },
                  }))}
                >
                  Auto Commenter {setupData.autoCommenter.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  type="button"
                  className={`btn ${setupData.autoCommenter.autoRun ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    autoCommenter: { ...prev.autoCommenter, autoRun: !prev.autoCommenter.autoRun },
                  }))}
                >
                  Auto Run {setupData.autoCommenter.autoRun ? "On" : "Off"}
                </button>
              </div>

              <h3 style={{ marginTop: "8px", marginBottom: "8px", fontSize: "16px" }}>Attribution</h3>
              <div className="form-row" style={{ marginTop: "12px" }}>
                <label>Attribution Time</label>
                <input
                  type="time"
                  value={setupData.attribution.dailyTime}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    attribution: { ...prev.attribution, dailyTime: e.target.value },
                  }))}
                />
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className={`btn ${setupData.attribution.enabled ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSetupData((prev) => ({
                    ...prev,
                    attribution: { ...prev.attribution, enabled: !prev.attribution.enabled },
                  }))}
                >
                  Attribution {setupData.attribution.enabled ? "On" : "Off"}
                </button>
              </div>

              <div className="hero-highlight" style={{ marginTop: "14px" }}>
                <strong>Finish Checklist</strong>
                <p style={{ margin: "8px 0 0" }}>
                  OpenAI: {hasStoredOpenAiKey || setupData.openaiKey.trim() ? "Ready" : "Missing"}
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  Runtime: {runtimeStatus?.browserReady ? "Ready" : "Needs attention"}
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  LinkedIn Login: {loginStatus?.loggedIn ? "Ready" : "Missing"}
                </p>
              </div>
            </section>
          </div>
        )}

        {(() => {
          let nextDisabled = busy;
          if (step === 0) nextDisabled = nextDisabled || (!licenseStatus?.licensed && !trialAccepted);
          if (step === 1) nextDisabled = nextDisabled || !runtimeStatus?.browserReady;
          if (step === 2) nextDisabled = nextDisabled || !loginStatus?.loggedIn;
          if (step === 3) nextDisabled = nextDisabled || (!hasStoredOpenAiKey && !setupData.openaiKey.trim());

          let primaryAction = null;
          if (step < steps.length - 1) {
            if (step === 0 && !licenseStatus?.licensed && !trialAccepted) {
              primaryAction = (
                <button className="btn btn-primary" type="button" onClick={() => { setTrialAccepted(true); setNotice("Trial mode selected. You can activate later from the License page."); }} disabled={busy}>
                  Start Trial
                </button>
              );
            } else if (step === 1 && !runtimeStatus?.browserReady) {
              primaryAction = (
                <button className="btn btn-primary" type="button" onClick={installRuntime} disabled={installingRuntime || busy}>
                  {installingRuntime ? "Installing Runtime..." : "Install Runtime"}
                </button>
              );
            } else if (step === 2 && !loginStatus?.loggedIn) {
              primaryAction = (
                <button className="btn btn-primary" type="button" onClick={refreshLogin} disabled={refreshingLogin || busy}>
                  {refreshingLogin ? "Opening Login..." : "Login to LinkedIn"}
                </button>
              );
            } else {
              primaryAction = (
                <button className="btn btn-primary" type="button" onClick={goNext} disabled={nextDisabled}>Next</button>
              );
            }
          }

          return (
        <div className="btn-row" style={{ marginTop: "18px", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" type="button" onClick={goBack} disabled={step === 0 || busy}>Back</button>
          <div className="btn-row">
            {step < steps.length - 1 ? (
              primaryAction
            ) : (
              <button className="btn btn-primary" type="button" onClick={completeSetup} disabled={busy}>
                {busy ? "Finishing Setup..." : "Complete Setup"}
              </button>
            )}
          </div>
        </div>
          );
        })()}
      </section>
    </div>
  );
}
