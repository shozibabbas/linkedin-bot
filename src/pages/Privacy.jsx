import React from 'react';

export default function Privacy() {
  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Legal</p>
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-subtitle">Last updated: April 2026. This policy explains what data is collected, where it is stored, and how it is used.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <section className="panel">
          <h2 className="panel-title">1. Overview</h2>
          <div className="legal-section">
            <p>
              This application is a local desktop tool. It does not operate a hosted user account backend, does not send your personal data to the developer's servers, and does not contain analytics or telemetry. All data relevant to the operation of the app stays on your machine.
            </p>
          </div>
          <div className="callout callout-info" style={{ marginTop: '0' }}>
            <strong>Short version:</strong> Your data stays on your machine. We don't have a server that knows who you are.
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">2. Data Stored Locally</h2>
          <div className="legal-section">
            <h3>Application Settings</h3>
            <p>Your scheduler configuration, context source URLs, author profile fields (designation, company), generation instructions, and max-words preference are stored in a local JSON config file in your OS user data directory.</p>
          </div>
          <div className="legal-section">
            <h3>OpenAI API Key</h3>
            <p>Your OpenAI API key is stored encrypted in the local config file. It is only read at generation time and is sent exclusively to <strong>api.openai.com</strong> as part of the API request. It is never logged or transmitted elsewhere.</p>
          </div>
          <div className="legal-section">
            <h3>LinkedIn Session Cookies</h3>
            <p>When you perform the "Refresh LinkedIn Login" flow, the resulting session cookies are saved to a local auth file on your machine. These cookies are used solely to authenticate posting requests directly to LinkedIn's web interface on your behalf. They are never uploaded to any third-party service.</p>
          </div>
          <div className="legal-section">
            <h3>Post History</h3>
            <p>Generated and published post records (text, status, timestamps, error messages) are stored in a local database file. This data is used to populate the Posts page and Dashboard and is not transmitted externally.</p>
          </div>
          <div className="legal-section">
            <h3>License State</h3>
            <p>Your license key and activation state are stored locally. During first-time activation and periodic background re-validation, the key is transmitted to the licensing server solely to verify authenticity. No other personal data accompanies this request.</p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">3. Third-Party Data Flows</h2>
          <div className="legal-section">
            <h3>OpenAI</h3>
            <p>When you generate a post, the following is sent to OpenAI's API: the assembled system prompt (including your generation instructions, author profile if enabled, and context source content). By using this feature you are also subject to <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noreferrer">OpenAI's Privacy Policy</a>.</p>
          </div>
          <div className="legal-section">
            <h3>LinkedIn</h3>
            <p>Publishing requests are sent directly to LinkedIn using your session cookies. The content of the post (text and hashtags) is transmitted at post time. Your use of LinkedIn is subject to <a href="https://www.linkedin.com/legal/privacy-policy" target="_blank" rel="noreferrer">LinkedIn's Privacy Policy</a>.</p>
          </div>
          <div className="legal-section">
            <h3>Context Source URLs</h3>
            <p>When a URL context source is used, the app makes an outbound HTTP request to that URL to fetch page content. Standard HTTP headers (User-Agent, Accept) are sent as part of the request. No tracking parameters or personal identifiers are added.</p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">4. Data Retention & Deletion</h2>
          <div className="legal-section">
            <p>All application data persists on your machine until you delete it. There is no automatic expiry. To remove all data:</p>
            <ul>
              <li>Uninstall the application to remove the binary.</li>
              <li>Delete the user data directory to remove settings, post history, and session files.</li>
              <li>macOS: <code>~/Library/Application Support/&lt;AppName&gt;</code></li>
              <li>Windows: <code>%APPDATA%\&lt;AppName&gt;</code></li>
              <li>Linux: <code>~/.config/&lt;AppName&gt;</code></li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">5. Children's Privacy</h2>
          <div className="legal-section">
            <p>This application is intended for professional use by adults (18+). It is not directed at individuals under 18 and does not knowingly collect data from minors.</p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">6. Changes to This Policy</h2>
          <div className="legal-section">
            <p>This policy may be updated with new application releases. The updated date at the top of this page reflects the most recent revision. Continued use of the application constitutes acceptance of any updated policy.</p>
          </div>
        </section>

        <div className="callout">
          <strong>Questions?</strong> If you have questions about how your data is handled, review the open-source code or contact the developer via the support channel listed in the README.
        </div>

      </div>
    </div>
  );
}
