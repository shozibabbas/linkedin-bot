import React from 'react';

export default function Terms() {
  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Legal</p>
        <h1 className="page-title">Terms of Use</h1>
        <p className="page-subtitle">Last updated: April 2026. Please read these terms before using the application.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <section className="panel">
          <h2 className="panel-title">1. Acceptance of Terms</h2>
          <div className="legal-section">
            <p>
              By installing or using this application, you agree to be bound by these Terms of Use. If you do not agree, do not use the software. These terms govern your use of the LinkedIn automation client, including all generation, scheduling, and publishing features.
            </p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">2. License Grant</h2>
          <div className="legal-section">
            <h3>What You're Licensed To Do</h3>
            <ul>
              <li>Install and run the application on a single machine associated with your license key.</li>
              <li>Use the software to generate, schedule, and publish LinkedIn posts from your own account.</li>
              <li>Modify configuration in accordance with the settings provided by the interface.</li>
            </ul>
          </div>
          <div className="legal-section">
            <h3>What You May Not Do</h3>
            <ul>
              <li>Share, resell, sublicense, or distribute your license key to any other person.</li>
              <li>Reverse-engineer, decompile, or extract the source code of the compiled application.</li>
              <li>Use the application to post content on behalf of any LinkedIn account other than your own.</li>
              <li>Automate interactions in a manner that violates LinkedIn's User Agreement or Platform Policies.</li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">3. Account Responsibility</h2>
          <div className="legal-section">
            <p>
              You are solely responsible for all content generated and published through this application. The application provides tools to assist content creation — the final decision to publish rests with you. You must ensure all posts comply with LinkedIn's Community Policies, Terms of Service, and applicable law.
            </p>
            <p>
              You acknowledge that automated posting tools carry a risk of temporary or permanent account restriction if LinkedIn detects behaviour that violates their policies. The developer assumes no liability for any account actions taken by LinkedIn against your account.
            </p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">4. API & Third-Party Service Costs</h2>
          <div className="legal-section">
            <p>
              This application uses your own OpenAI API key. All API call costs are billed directly to your OpenAI account. The developer of this application is not responsible for any charges incurred through your OpenAI account as a result of using the generation features.
            </p>
            <p>
              LinkedIn session-based posting is performed through browser automation against your own account. You are responsible for ensuring your LinkedIn usage complies with LinkedIn's rate limits and automation policies.
            </p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">5. Acceptable Use</h2>
          <div className="legal-section">
            <h3>Prohibited Uses</h3>
            <ul>
              <li>Using the application to post spam, misinformation, or harassing content.</li>
              <li>Posting content that infringes intellectual property rights of third parties.</li>
              <li>Using the application in any way intended to manipulate LinkedIn's algorithms maliciously.</li>
              <li>Attempting to circumvent LinkedIn rate limits in ways that could impact platform stability.</li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">6. Disclaimer of Warranties</h2>
          <div className="legal-section">
            <p>
              The software is provided <strong>"as is"</strong> without warranties of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, or non-infringement. The developer does not guarantee that the application will be error-free, uninterrupted, or compatible with all future versions of LinkedIn's web interface.
            </p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">7. Limitation of Liability</h2>
          <div className="legal-section">
            <p>
              To the maximum extent permitted by applicable law, the developer shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the application, including but not limited to: loss of LinkedIn account access, missed posting opportunities, or reputational harm arising from published content.
            </p>
            <p>
              Your sole remedy for dissatisfaction with the application is to stop using it and, where applicable under your jurisdiction's consumer protection laws, to request a refund within the specified refund window.
            </p>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">8. Updates to These Terms</h2>
          <div className="legal-section">
            <p>
              These terms may be updated with new application releases. Continued use of the application after an update constitutes acceptance of the revised terms. The date at the top of this page reflects the most recent revision.
            </p>
          </div>
        </section>

        <div className="callout callout-warn">
          <strong>Summary:</strong> Use the tool responsibly on your own LinkedIn account. Don't share license keys. All content you post is your responsibility. API costs go to your own OpenAI account.
        </div>

      </div>
    </div>
  );
}
