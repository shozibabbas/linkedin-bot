import React, { useEffect, useState } from "react";

export default function License() {
  const [loading, setLoading] = useState(true);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [trialStatus, setTrialStatus] = useState(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [ls, ts] = await Promise.all([
        window.electronAPI?.getLicenseStatus(),
        window.electronAPI?.getTrialStatus(),
      ]);
      setLicenseStatus(ls);
      setTrialStatus(ts);
    } catch (e) {
      setError(`Failed to load license status: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activate = async () => {
    if (!licenseKey.trim()) {
      setError("Enter a valid license key.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setNotice("");
      const result = await window.electronAPI?.activateLicense(licenseKey.trim());
      if (!result?.success) {
        throw new Error(result?.error || "Activation failed.");
      }
      setNotice(result.status === "already_activated" ? "This device is already activated." : "License activated successfully.");
      setLicenseKey("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <section className="panel"><p className="empty-state">Loading license data...</p></section>
      </div>
    );
  }

  const licensed = Boolean(licenseStatus?.licensed);

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Access Control</p>
        <h1 className="page-title">License</h1>
        <p className="page-subtitle">Activate your key, inspect trial lifecycle, and verify feature access state.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="grid-3" style={{ marginBottom: "18px" }}>
        <div className="panel">
          <h2 className="panel-title">Current Plan</h2>
          <p><strong>{licensed ? "Licensed" : "Trial / Free"}</strong></p>
          <p className="page-subtitle">{licensed ? "Full automation unlocked." : "Activate for unlimited usage."}</p>
        </div>
        <div className="panel">
          <h2 className="panel-title">Trial Status</h2>
          <p><strong>{trialStatus?.inTrial ? "Active" : "Expired"}</strong></p>
          <p className="page-subtitle">Days remaining: {trialStatus?.daysRemaining || 0}</p>
        </div>
        <div className="panel">
          <h2 className="panel-title">Device Slots</h2>
          <p><strong>{licenseStatus?.computerCount || 0} / 2</strong></p>
          <p className="page-subtitle">Each key supports up to two devices.</p>
        </div>
      </div>

      <section className="panel">
        <h2 className="panel-title">Activate License Key</h2>
        <div className="form-row">
          <label>Encrypted License Key</label>
          <textarea
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="Paste full license string"
          />
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" onClick={activate} disabled={busy}>
            {busy ? "Activating..." : "Activate"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={load}>Refresh Status</button>
        </div>
      </section>
    </div>
  );
}
