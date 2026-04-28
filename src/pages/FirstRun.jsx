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
  const [setupData, setSetupData] = useState({
    openaiKey: "",
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
    workContexts: [defaultContext()],
    playwright: {
      browserMode: "managed",
      browserPath: "",
    },
    installWithDeps: false,
  });

  const steps = useMemo(() => ([
    "License",
    "Runtime & Login",
    "Automation Settings",
    "Content Sources",
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
          generationProfile: settings?.generationProfile || prev.generationProfile,
          scheduler: settings?.scheduler || prev.scheduler,
          attribution: settings?.attribution || prev.attribution,
          workContexts: contexts,
          playwright: settings?.playwright || prev.playwright,
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
      const result = await window.electronAPI.installPlaywrightRuntime({
        withDeps: setupData.installWithDeps,
      });
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

  const pickBrowserPath = async () => {
    try {
      setError("");
      const result = await window.electronAPI.pickBrowserExecutable();
      if (result?.canceled || !result?.path) {
        return;
      }
      setSetupData((prev) => ({
        ...prev,
        playwright: {
          ...prev.playwright,
          browserPath: result.path,
        },
      }));
    } catch (e) {
      setError(`Browser picker failed: ${e.message}`);
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

    if (setupData.playwright.browserMode === "custom" && !setupData.playwright.browserPath.trim()) {
      setError("Select a browser executable path when using Custom Browser mode.");
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

    try {
      setBusy(true);
      setError("");
      setNotice("");

      const payload = {
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
        workContexts: validWorkContexts,
        playwright: {
          browserMode: setupData.playwright.browserMode,
          browserPath: setupData.playwright.browserPath,
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
                <button className="btn btn-ghost" type="button" onClick={() => { setTrialAccepted(true); setNotice("Trial mode selected. You can activate later from License page."); }}>Continue with Trial</button>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">What Happens Next</h2>
              <p>1. Install/verify Playwright runtime.</p>
              <p>2. Refresh LinkedIn login session.</p>
              <p>3. Add OpenAI key + scheduler defaults.</p>
              <p>4. Configure context sources and complete setup.</p>
            </section>
          </div>
        )}

        {step === 1 && (
          <div className="grid-2">
            <section className="panel">
              <h2 className="panel-title">Playwright Runtime</h2>
              <div className="form-row">
                <label>Browser Mode</label>
                <select
                  value={setupData.playwright.browserMode}
                  onChange={(e) => setSetupData((prev) => ({
                    ...prev,
                    playwright: { ...prev.playwright, browserMode: e.target.value },
                  }))}
                >
                  <option value="managed">Managed Playwright Chromium</option>
                  <option value="chrome">System Chrome Channel</option>
                  <option value="msedge">System Edge Channel</option>
                  <option value="custom">Custom Executable</option>
                </select>
              </div>

              {setupData.playwright.browserMode === "managed" && (
                <>
                  {navigator.platform.toLowerCase().includes("linux") && (
                    <div className="form-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={setupData.installWithDeps}
                          onChange={(e) => setSetupData((prev) => ({ ...prev, installWithDeps: e.target.checked }))}
                        />
                        <span style={{ marginLeft: "8px" }}>Install Linux system dependencies too (sudo may be required)</span>
                      </label>
                    </div>
                  )}
                  <div className="btn-row">
                    <button className="btn btn-primary" type="button" onClick={installRuntime} disabled={installingRuntime}>
                      {installingRuntime ? "Installing Runtime..." : "Install Managed Runtime"}
                    </button>
                  </div>
                </>
              )}

              {setupData.playwright.browserMode === "custom" && (
                <>
                  <div className="form-row">
                    <label>Custom Browser Executable</label>
                    <input
                      value={setupData.playwright.browserPath}
                      onChange={(e) => setSetupData((prev) => ({
                        ...prev,
                        playwright: { ...prev.playwright, browserPath: e.target.value },
                      }))}
                      placeholder="/Applications/Google Chrome.app/.../Google Chrome"
                    />
                  </div>
                  <div className="btn-row">
                    <button className="btn btn-ghost" type="button" onClick={pickBrowserPath}>Select Executable</button>
                  </div>
                </>
              )}

              <p className="page-subtitle" style={{ marginTop: "12px" }}>
                Runtime status: {runtimeStatus?.details || "Unknown"}
              </p>
              {runtimeLog && (
                <textarea readOnly value={runtimeLog} style={{ marginTop: "10px", minHeight: "110px" }} />
              )}
            </section>

            <section className="panel">
              <h2 className="panel-title">LinkedIn Session</h2>
              <p className="page-subtitle">Saved session: {loginStatus?.loggedIn ? "Available" : "Missing"}</p>
              <p className="page-subtitle">Last updated: {loginStatus?.lastUpdated ? new Date(loginStatus.lastUpdated).toLocaleString() : "Never"}</p>
              <p className="page-subtitle">Path: {loginStatus?.authPath || "N/A"}</p>

              <div className="btn-row" style={{ marginTop: "12px" }}>
                <button className="btn btn-ghost" type="button" onClick={refreshLogin} disabled={refreshingLogin}>
                  {refreshingLogin ? "Opening Login..." : "Refresh LinkedIn Login"}
                </button>
              </div>
            </section>
          </div>
        )}

        {step === 2 && (
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

        {step === 3 && (
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
              <h2 className="panel-title">Attribution Settings</h2>
              <p className="page-subtitle">Configure daily attribution post behavior for free/trial mode.</p>
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
          if (step === 1) nextDisabled = nextDisabled || !runtimeStatus?.browserReady || !loginStatus?.loggedIn;
          if (step === 2) nextDisabled = nextDisabled || (!hasStoredOpenAiKey && !setupData.openaiKey.trim());
          return (
        <div className="btn-row" style={{ marginTop: "18px", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" type="button" onClick={goBack} disabled={step === 0 || busy}>Back</button>
          <div className="btn-row">
            {step < steps.length - 1 ? (
              <button className="btn btn-primary" type="button" onClick={goNext} disabled={nextDisabled}>Next</button>
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
