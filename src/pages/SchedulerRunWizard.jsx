import React, { useEffect, useMemo, useState } from "react";

function toLocalDateTimeInput(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoOrExisting(localValue, fallbackIso) {
  if (!localValue) {
    return fallbackIso;
  }
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    return fallbackIso;
  }
  return date.toISOString();
}

function makeEntryId() {
  return `entry-ui-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export default function SchedulerRunWizard({ onDone }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [constraints, setConstraints] = useState(null);
  const [sourceContexts, setSourceContexts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [progressByEntry, setProgressByEntry] = useState({});
  const [regenerateOptions, setRegenerateOptions] = useState({});

  useEffect(() => {
    async function loadPlan() {
      try {
        setLoading(true);
        setError("");
        const plan = await window.electronAPI.getSchedulerRunPlan();
        setConstraints(plan?.constraints || null);
        setSourceContexts(Array.isArray(plan?.contexts) ? plan.contexts : []);
        setEntries(Array.isArray(plan?.entries) ? plan.entries : []);
      } catch (e) {
        setError(`Failed to load scheduler plan: ${e.message}`);
      } finally {
        setLoading(false);
      }
    }

    loadPlan();
  }, []);

  useEffect(() => {
    const dispose = window.electronAPI.onSchedulerRunProgress((payload) => {
      if (!payload?.entryId) {
        return;
      }

      if (payload.sessionId && sessionId && payload.sessionId !== sessionId) {
        return;
      }

      setProgressByEntry((prev) => ({
        ...prev,
        [payload.entryId]: {
          phase: payload.phase,
          status: payload.status,
          message: payload.message || "",
        },
      }));
    });

    return () => {
      dispose?.();
    };
  }, [sessionId]);

  const generatedEntries = useMemo(() => entries.filter((entry) => entry.type !== "attribution"), [entries]);

  const hasDrafts = useMemo(() => entries.some((entry) => String(entry.generatedContent || "").trim()), [entries]);

  const generationFailedCount = useMemo(
    () => entries.filter((entry) => entry.generationStatus === "failed").length,
    [entries]
  );

  const postingFailedCount = useMemo(
    () => Object.values(progressByEntry).filter((state) => state.phase === "posting" && state.status === "failed").length,
    [progressByEntry]
  );

  const canAddGeneratedEntry = useMemo(() => {
    if (!constraints) return false;
    return generatedEntries.length < Number(constraints.maxPosts || 1);
  }, [constraints, generatedEntries.length]);

  const canGenerate = useMemo(() => {
    if (busy || generating || posting || !constraints || entries.length === 0) {
      return false;
    }

    const nonAttribution = entries.filter((entry) => entry.type !== "attribution");
    if (nonAttribution.length === 0) {
      return false;
    }

    if (nonAttribution.length > Number(constraints.maxPosts || 1)) {
      return false;
    }

    const uniqueSources = new Set(
      nonAttribution
        .map((entry) => `${entry?.source?.type || "text"}:${String(entry?.source?.value || "").trim()}`)
        .filter((value) => value !== "text:")
    );

    if (uniqueSources.size > Number(constraints.maxContextSources || 1)) {
      return false;
    }

    for (const entry of entries) {
      const scheduled = new Date(entry.scheduledAt);
      if (Number.isNaN(scheduled.getTime())) {
        return false;
      }

      if (entry.type !== "attribution" && !String(entry?.source?.value || "").trim()) {
        return false;
      }
    }

    if (constraints.attributionRequired && !entries.some((entry) => entry.type === "attribution")) {
      return false;
    }

    return true;
  }, [busy, generating, posting, constraints, entries]);

  function patchEntry(entryId, patch) {
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)));
  }

  function patchEntrySource(entryId, sourcePatch) {
    setEntries((prev) => prev.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }
      return {
        ...entry,
        source: {
          ...(entry.source || { type: "text", value: "", prompt: "" }),
          ...sourcePatch,
        },
      };
    }));
  }

  function addGeneratedEntry() {
    if (!canAddGeneratedEntry) {
      return;
    }

    const defaultSource = sourceContexts[0] || { type: "text", value: "", prompt: "" };
    const nextTime = new Date(Date.now() + 30 * 60000);
    nextTime.setSeconds(0, 0);

    setEntries((prev) => ([
      ...prev,
      {
        id: makeEntryId(),
        type: "generated",
        scheduledAt: nextTime.toISOString(),
        source: {
          type: defaultSource.type,
          value: defaultSource.value,
          prompt: defaultSource.prompt || "",
        },
        customPrompt: "",
        generatedContent: "",
        generationStatus: "planned",
        postingStatus: "pending",
        error: "",
      },
    ]));
  }

  function removeEntry(entryId) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    if (constraints?.attributionRequired && entry.type === "attribution") {
      setError("Attribution entry is mandatory in free mode and cannot be removed.");
      return;
    }

    setEntries((prev) => prev.filter((item) => item.id !== entryId));
  }

  function setSourceByPreset(entryId, presetValue) {
    const source = sourceContexts[Number(presetValue)] || null;
    if (!source) {
      return;
    }
    patchEntrySource(entryId, {
      type: source.type,
      value: source.value,
      prompt: source.prompt || "",
    });
  }

  async function generateAll({ autoPostAfterGenerate }) {
    try {
      if (!canGenerate) {
        setError("Fix arrangement validation errors before generating.");
        return;
      }

      setBusy(true);
      setGenerating(true);
      setError("");
      setNotice("Starting parallel generation...");
      setProgressByEntry({});

      const result = await window.electronAPI.generateSchedulerRunDrafts({
        sessionId,
        constraints,
        entries,
      });

      const nextSession = result?.sessionId || sessionId;
      setSessionId(nextSession);
      setEntries(Array.isArray(result?.entries) ? result.entries : []);

      const failed = Number(result?.summary?.failed || 0);
      if (failed > 0) {
        setNotice(`Generation completed with ${failed} failed draft(s). Fix or regenerate before posting.`);
      } else {
        setNotice("All drafts generated successfully.");
      }

      if (autoPostAfterGenerate) {
        if (failed > 0) {
          setError("Cannot auto-post because one or more drafts failed to generate.");
          return;
        }
        await executePosting(nextSession, Array.isArray(result?.entries) ? result.entries : []);
      }
    } catch (e) {
      setError(`Generation failed: ${e.message}`);
    } finally {
      setGenerating(false);
      setBusy(false);
    }
  }

  async function regenerateOne(entry) {
    const options = regenerateOptions[entry.id] || {};

    try {
      setError("");
      setNotice(`Regenerating entry ${entry.id}...`);
      setProgressByEntry((prev) => ({
        ...prev,
        [entry.id]: {
          phase: "generation",
          status: "running",
          message: "Regenerating...",
        },
      }));

      const result = await window.electronAPI.regenerateSchedulerRunEntry({
        sessionId,
        entry,
        customPrompt: options.customPrompt || entry.customPrompt || "",
        temporaryContext: options.useTemporaryContext
          ? {
              type: options.temporaryContextType === "url" ? "url" : "text",
              value: options.temporaryContextValue || "",
              prompt: options.temporaryContextPrompt || "",
            }
          : null,
      });

      const updated = result?.entry;
      if (!updated?.id) {
        throw new Error("Invalid regeneration response.");
      }

      setSessionId(result?.sessionId || sessionId);
      setEntries((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Entry ${updated.id} regenerated.`);
    } catch (e) {
      setError(`Regenerate failed: ${e.message}`);
    }
  }

  async function executePosting(sessionOverride, entriesOverride) {
    try {
      const targetEntries = entriesOverride || entries;
      if (!targetEntries.every((entry) => String(entry.generatedContent || "").trim())) {
        setError("All entries must have generated content before posting.");
        return;
      }

      setBusy(true);
      setPosting(true);
      setError("");
      setNotice("Launching parallel Playwright scheduling flows...");

      const result = await window.electronAPI.executeSchedulerRun({
        sessionId: sessionOverride || sessionId,
        constraints,
        entries: targetEntries,
      });

      const failed = Number(result?.summary?.failed || 0);
      if (failed > 0) {
        setError(`Posting completed with ${failed} failure(s). Review statuses below.`);
      } else {
        setNotice("All posts were scheduled successfully on LinkedIn.");
      }
    } catch (e) {
      setError(`Posting failed: ${e.message}`);
    } finally {
      setPosting(false);
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <section className="panel">
          <p className="page-kicker">Scheduler Wizard</p>
          <h1 className="page-title">Preparing Run Plan</h1>
          <p className="page-subtitle">Loading constraints, contexts, and default schedule arrangement...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Manual Scheduler Orchestration</p>
        <h1 className="page-title">Plan, Generate, Review, Schedule</h1>
        <p className="page-subtitle">Build arrangement, generate all drafts in parallel, optionally review, then launch all posting flows in parallel.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <section className="hero-highlight" style={{ marginBottom: "18px" }}>
        <p style={{ margin: 0 }}>
          Mode: <strong>{constraints?.mode || "unknown"}</strong> | Max generated posts: <strong>{constraints?.maxPosts || 0}</strong> | Max context sources: <strong>{constraints?.maxContextSources || 0}</strong> | Attribution required: <strong>{constraints?.attributionRequired ? "Yes" : "No"}</strong>
        </p>
      </section>

      <section className="panel" style={{ marginBottom: "18px" }}>
        <h2 className="panel-title">1. Arrangement</h2>
        <p className="page-subtitle">Set source, optional prompt, and schedule time for each entry before generation.</p>

        <div className="list" style={{ marginTop: "12px" }}>
          {entries.map((entry, index) => {
            const progress = progressByEntry[entry.id];
            const regen = regenerateOptions[entry.id] || {};
            const generated = String(entry.generatedContent || "").trim();

            return (
              <div key={entry.id} className="list-item">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                  <strong>Entry {index + 1} {entry.type === "attribution" ? "(Attribution)" : "(Generated)"}</strong>
                  <span className={`chip ${progress?.status === "failed" ? "failed" : progress?.status === "done" ? "posted" : progress?.status === "running" ? "scheduled" : "pending"}`}>
                    {progress?.phase || "idle"}: {progress?.status || "waiting"}
                  </span>
                </div>

                <div className="grid-2">
                  <div className="form-row">
                    <label>Scheduled Time</label>
                    <input
                      type="datetime-local"
                      value={toLocalDateTimeInput(entry.scheduledAt)}
                      onChange={(e) => patchEntry(entry.id, { scheduledAt: toIsoOrExisting(e.target.value, entry.scheduledAt) })}
                      disabled={busy}
                    />
                  </div>

                  {entry.type !== "attribution" ? (
                    <div className="form-row">
                      <label>Source Preset</label>
                      <select
                        value={Math.max(0, sourceContexts.findIndex((ctx) => ctx.type === entry?.source?.type && ctx.value === entry?.source?.value))}
                        onChange={(e) => setSourceByPreset(entry.id, e.target.value)}
                        disabled={busy}
                      >
                        {sourceContexts.map((ctx, sourceIndex) => (
                          <option key={`${sourceIndex}-${ctx.type}`} value={sourceIndex}>
                            {ctx.type.toUpperCase()} - {String(ctx.value).slice(0, 54)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="form-row">
                      <label>Attribution</label>
                      <input value="System attribution post" disabled />
                    </div>
                  )}
                </div>

                {entry.type !== "attribution" && (
                  <>
                    <div className="form-row">
                      <label>Custom Prompt (Optional)</label>
                      <input
                        value={entry.customPrompt || ""}
                        onChange={(e) => patchEntry(entry.id, { customPrompt: e.target.value })}
                        placeholder="Optional generation guidance for this entry"
                        disabled={busy}
                      />
                    </div>

                    <div className="form-row">
                      <label>Source Value</label>
                      <textarea
                        value={entry?.source?.value || ""}
                        onChange={(e) => patchEntrySource(entry.id, { value: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                  </>
                )}

                <div className="btn-row" style={{ justifyContent: "space-between", marginTop: "8px" }}>
                  <div className="btn-row">
                    {entry.type !== "attribution" && (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setRegenerateOptions((prev) => ({
                          ...prev,
                          [entry.id]: {
                            ...prev[entry.id],
                            showAdvanced: !prev?.[entry.id]?.showAdvanced,
                          },
                        }))}
                        disabled={busy}
                      >
                        {regen.showAdvanced ? "Hide Regenerate Controls" : "Show Regenerate Controls"}
                      </button>
                    )}
                  </div>

                  <button className="btn btn-ghost" type="button" onClick={() => removeEntry(entry.id)} disabled={busy}>
                    Remove Entry
                  </button>
                </div>

                {regen.showAdvanced && entry.type !== "attribution" && (
                  <div className="hero-highlight" style={{ marginTop: "10px" }}>
                    <div className="form-row">
                      <label>Regenerate Custom Prompt</label>
                      <input
                        value={regen.customPrompt || ""}
                        onChange={(e) => setRegenerateOptions((prev) => ({
                          ...prev,
                          [entry.id]: {
                            ...prev[entry.id],
                            customPrompt: e.target.value,
                          },
                        }))}
                        placeholder="Add one-off prompt for regeneration"
                        disabled={busy}
                      />
                    </div>

                    <div className="form-row">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={Boolean(regen.useTemporaryContext)}
                          onChange={(e) => setRegenerateOptions((prev) => ({
                            ...prev,
                            [entry.id]: {
                              ...prev[entry.id],
                              useTemporaryContext: e.target.checked,
                            },
                          }))}
                          disabled={busy}
                        />
                        <span className="checkbox-label-text">Use temporary context for this regeneration</span>
                      </label>
                    </div>

                    {regen.useTemporaryContext && (
                      <>
                        <div className="form-row">
                          <label>Temporary Context Type</label>
                          <select
                            value={regen.temporaryContextType || "text"}
                            onChange={(e) => setRegenerateOptions((prev) => ({
                              ...prev,
                              [entry.id]: {
                                ...prev[entry.id],
                                temporaryContextType: e.target.value,
                              },
                            }))}
                            disabled={busy}
                          >
                            <option value="text">Text</option>
                            <option value="url">URL</option>
                          </select>
                        </div>

                        <div className="form-row">
                          <label>Temporary Context Value</label>
                          <textarea
                            value={regen.temporaryContextValue || ""}
                            onChange={(e) => setRegenerateOptions((prev) => ({
                              ...prev,
                              [entry.id]: {
                                ...prev[entry.id],
                                temporaryContextValue: e.target.value,
                              },
                            }))}
                            disabled={busy}
                          />
                        </div>
                      </>
                    )}

                    <div className="btn-row">
                      <button className="btn btn-primary" type="button" onClick={() => regenerateOne(entry)} disabled={busy || generating || posting}>
                        Regenerate This Entry
                      </button>
                    </div>
                  </div>
                )}

                {generated && (
                  <div className="form-row" style={{ marginTop: "12px", marginBottom: 0 }}>
                    <label>Generated Content (Editable)</label>
                    <textarea
                      value={entry.generatedContent}
                      onChange={(e) => patchEntry(entry.id, { generatedContent: e.target.value })}
                      disabled={posting}
                      style={{ minHeight: "130px" }}
                    />
                  </div>
                )}

                {(entry.error || progress?.message) && (
                  <p className="page-subtitle" style={{ marginTop: "8px" }}>
                    {entry.error || progress?.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="btn-row" style={{ marginTop: "14px", justifyContent: "space-between" }}>
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={addGeneratedEntry} disabled={!canAddGeneratedEntry || busy}>
              Add Entry
            </button>
            <button className="btn btn-ghost" type="button" onClick={onDone} disabled={busy}>
              Back to Dashboard
            </button>
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" type="button" onClick={() => generateAll({ autoPostAfterGenerate: false })} disabled={!canGenerate}>
              {generating ? <span className="spinner-inline" /> : null}
              Generate Drafts (Review)
            </button>
            <button className="btn btn-primary" type="button" onClick={() => generateAll({ autoPostAfterGenerate: true })} disabled={!canGenerate}>
              {generating || posting ? <span className="spinner-inline" /> : null}
              Generate and Post Without Review
            </button>
          </div>
        </div>
      </section>

      {hasDrafts && (
        <section className="panel">
          <h2 className="panel-title">2. Confirm And Schedule</h2>
          <p className="page-subtitle">After reviewing and editing drafts, launch all Playwright posting sessions in parallel.</p>

          <div className="hero-highlight" style={{ marginTop: "12px" }}>
            <p style={{ margin: 0 }}>
              Generation failures: <strong>{generationFailedCount}</strong> | Posting failures: <strong>{postingFailedCount}</strong>
            </p>
          </div>

          <div className="btn-row" style={{ marginTop: "14px" }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => executePosting()}
              disabled={busy || posting || entries.some((entry) => !String(entry.generatedContent || "").trim())}
            >
              {posting ? <span className="spinner-inline" /> : null}
              Confirm and Schedule All Posts
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
