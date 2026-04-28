import React, { useState } from 'react';

const FAQS = [
  {
    tag: 'setup',
    tagLabel: 'Setup',
    q: 'Do I need an OpenAI API key?',
    a: 'Yes. All AI content generation runs through your own OpenAI key. This gives you full control over costs and model choice. Your key is stored locally in the app\'s config file — it is never transmitted to any server other than OpenAI\'s own API.',
  },
  {
    tag: 'setup',
    tagLabel: 'Setup',
    q: 'Where are my settings stored?',
    a: 'All settings (API key, scheduler config, context sources) are stored in a local JSON config file on your machine. The default location is in your OS user data directory under the app name. Nothing is sent to or stored on an external server.',
  },
  {
    tag: 'setup',
    tagLabel: 'Setup',
    q: 'The app says my LinkedIn session is missing. What should I do?',
    a: 'Go to Settings → Account and click "Refresh LinkedIn Login". This opens a browser window for you to log in to LinkedIn. Once you log in, the session cookies are saved locally. You may need to redo this every few weeks as LinkedIn sessions expire.',
  },
  {
    tag: 'posting',
    tagLabel: 'Posting',
    q: 'Can I post immediately without scheduling?',
    a: 'Yes. On the Posts page, any approved post has a "Post Now" button. It queues the post with a short stability buffer (a few seconds) and then publishes it using your saved LinkedIn session. The post status updates to "Posted" once confirmed.',
  },
  {
    tag: 'posting',
    tagLabel: 'Posting',
    q: 'Why did my post fail?',
    a: 'The most common causes are: (1) expired LinkedIn session — refresh it in Settings → Account; (2) LinkedIn rate-limiting — if you\'ve posted too frequently in a short window; (3) network error during the posting attempt. Check the post entry in the Posts page for the specific error message logged.',
  },
  {
    tag: 'posting',
    tagLabel: 'Posting',
    q: 'Can I edit a post after it\'s been generated?',
    a: 'Yes. Click on any pending or approved post to open the inline editor. You can edit the body text, change hashtags, or add your own content before approving. Edits are saved automatically.',
  },
  {
    tag: 'posting',
    tagLabel: 'Posting',
    q: 'How does the scheduler pick posting times?',
    a: 'The scheduler divides your configured start–end window into equal-ish slots based on your posts-per-day setting, then adds a random offset within each slot. This prevents posts from appearing at the exact same time every day, which can look automated.',
  },
  {
    tag: 'posting',
    tagLabel: 'Posting',
    q: 'What happens if my Posts queue runs out of approved posts?',
    a: 'The scheduler will not post anything until new approved posts are available. It does not skip the day — it simply waits. Add more approved posts to resume the normal posting cadence.',
  },
  {
    tag: 'license',
    tagLabel: 'License',
    q: 'What is the difference between Trial and Full Access?',
    a: 'Trial mode limits you to a small number of AI-generated posts per day and schedules a daily attribution post. Full Access (activated with a license key) removes these limits, disables attribution posts, and unlocks all scheduler settings.',
  },
  {
    tag: 'license',
    tagLabel: 'License',
    q: 'My license key isn\'t activating. What should I try?',
    a: 'Make sure you\'re connected to the internet — first-time validation requires a server check. Check for typos or extra spaces in the key. If the issue persists, contact support with your key and the error message shown.',
  },
  {
    tag: 'license',
    tagLabel: 'License',
    q: 'Can I use one license key on multiple machines?',
    a: 'No. Each license key is locked to a single device. If you need to transfer your license to a new machine (e.g. after upgrading your laptop), contact support to initiate a device transfer.',
  },
  {
    tag: 'privacy',
    tagLabel: 'Privacy',
    q: 'Does the app collect any usage data?',
    a: 'No. The app does not have any analytics or telemetry. Your posts, settings, and API keys never leave your machine except as direct API calls to LinkedIn (for posting) and OpenAI (for generation).',
  },
  {
    tag: 'privacy',
    tagLabel: 'Privacy',
    q: 'Is my LinkedIn password stored?',
    a: 'No. The app never asks for your LinkedIn password. It uses browser-based session cookies obtained when you log in via the "Refresh LinkedIn Login" flow. These cookies are stored locally on your machine in the app\'s data directory.',
  },
  {
    tag: 'privacy',
    tagLabel: 'Privacy',
    q: 'Can I delete all my data?',
    a: 'Yes. Uninstalling the app removes the binary. To fully remove all data, also delete the app\'s user data folder. On macOS this is typically ~/Library/Application Support/<AppName>. On Windows it\'s %APPDATA%\\<AppName>.',
  },
];

const TAG_FILTERS = ['all', 'setup', 'posting', 'license', 'privacy'];

export default function FAQs() {
  const [filter, setFilter] = useState('all');
  const visible = filter === 'all' ? FAQS : FAQS.filter((f) => f.tag === filter);

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Support</p>
        <h1 className="page-title">Frequently Asked Questions</h1>
        <p className="page-subtitle">Answers to the most common questions about setup, posting, licensing, and privacy.</p>
      </div>

      {/* Filter bar */}
      <div className="tab-bar">
        {TAG_FILTERS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab-btn ${filter === t ? 'is-active' : ''}`}
            onClick={() => setFilter(t)}
          >
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="faq-list">
          {visible.map((item, i) => (
            <div key={i} className="faq-item">
              <div className="faq-q">
                <span className={`faq-tag ${item.tag}`}>{item.tagLabel}</span>
                {item.q}
              </div>
              <p className="faq-a">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
