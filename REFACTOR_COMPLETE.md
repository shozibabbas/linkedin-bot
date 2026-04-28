# LinkedIn Bot - Electron Desktop App

## 🚀 Major Refactor Complete

This is a complete rewrite of LinkedIn Bot as a desktop application using Electron, featuring:

### ✅ Core Features Implemented

#### 1. **Electron Desktop App**
- **main.js**: Electron main process with window management
- **preload.js**: Secure IPC bridge for renderer → main communication
- **Built-in Services**: License, Posts, Settings, Scheduler

#### 2. **Licensing System** (No Server Required)
- **Symmetric Encryption**: Users cannot easily modify license keys
- **Hardware-Locked**: Computer ID based on MAC address + hostname
- **2-Device Limit**: Each license key activates on max 2 computers
- **One-Time Purchase**: Perpetual license, never expires
- **Location**: `license.js`

#### 3. **7-Day Free Trial + Attribution**
- Day 1-7: Full access (2 posts/day max, single context)
- Day 8+: Daily "Shozib Abbas" attribution post automatically added
- Multiple attribution post wordings for variety
- Auto-scheduled at random time within active hours
- Cannot be disabled on free tier

#### 4. **Posts Module** 
- **Manual Entry**: Write posts directly
- **URL Generation**: Paste URL → AI generates LinkedIn-friendly post (requires OpenAI key)
- **Text Generation**: Provide context text → AI generates post
- **Post Actions**: Post now (15 min ahead), Schedule custom time
- **History**: View all posts with status filtering

#### 5. **Scheduler (Morning-Only)**
- **Single Daily Run**: Configurable time (default 9 AM)
- **Automatic Posting**: Batch generates posts for entire day
- **Random Distribution**: Posts spread randomly within active hours
- **Work Context Cycling**: Rotates through configured URLs/text daily
- **Parallel Generation**: Uses Promise.all for concurrent post generation

#### 6. **Settings & Preferences**
- **OpenAI API Key**: Stored encrypted locally, never sent to servers
- **Scheduler Times**: Start/end times for daily posting window
- **Posts Per Day**: Configurable (free: max 2, paid: unlimited)
- **Work Contexts**: Manage URLs and text snippets to cycle through
- **Active Hours**: Define when posts can be scheduled
- **Auto-Run**: Toggle daily scheduler on/off

#### 7. **UI Pages (Lamborghini Dark Theme)**
- **Dashboard**: Status overview, trial countdown, quick stats
- **Posts Module**: Create, generate, schedule posts
- **Settings**: Preferences and API configuration
- **License**: License status, trial info, purchase link
- **Tutorials**: Getting started guides
- **FAQs**: Common questions
- **Terms & Conditions**: Legal terms
- **Privacy Policy**: Data handling

### 📁 File Structure

```
linkedin-bot/
├── main.js                  # Electron main process
├── preload.js              # IPC bridge
├── license.js              # Licensing system (symmetric encryption)
├── posts-service.js        # Posts CRUD + AI generation
├── settings-service.js     # Settings management
├── scheduler-service.js    # Daily scheduler orchestration
├── db.js                   # Database (posts_v2, trial_info tables)
├── src/
│   ├── App.jsx             # Main router
│   ├── main.jsx            # React entry point
│   ├── styles.css          # Lamborghini theme styles
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── PostsModule.jsx
│   │   ├── Settings.jsx
│   │   ├── FirstRun.jsx
│   │   ├── License.jsx
│   │   ├── Tutorials.jsx
│   │   ├── FAQs.jsx
│   │   ├── Terms.jsx
│   │   └── Privacy.jsx
│   └── components/
│       └── Navigation.jsx   # Sidebar nav
├── package.json            # Updated with Electron deps
└── vite.config.js         # Vite config for Electron
```

### 🔑 Key Services

#### **license.js**
- `validateLicense(licenseKey)`: Verify license structure
- `activateLicense(licenseKey)`: Activate on this computer  
- `getLicenseStatus()`: Current license state
- `getTrialStatus()`: Days remaining in trial
- `isFreeUser()`: Determine tier

#### **posts-service.js**
- `createManualPost(content)`: Save manual post
- `generatePostFromUrl(url)`: AI generate from article
- `generatePostFromText(text)`: AI generate from text
- `postNow(postId)`: Post immediately (15 min ahead)
- `scheduleForLater(postId, scheduledAt)`: Custom schedule

#### **scheduler-service.js**
- `runDailyScheduling()`: Generate posts for today
- `calculateTimeSlots(start, end, count)`: Compute schedule times
- `getNextContext()`: Cycle through work contexts
- `shouldAddAttributionPost()`: Check if free user day 8+
- `getStatus()`: Current scheduler state

#### **settings-service.js**
- `getOpenaiKey()` / `setOpenaiKey(key)`: API key management
- `getSchedulerSettings()` / `updateSchedulerSettings()`: Timing config
- `getWorkContexts()` / `updateWorkContexts()`: Context sources
- `getAttributionSettings()` / `updateAttributionSettings()`: Attribution control

### 🗄️ Database Schema

#### **posts_v2** (New)
```sql
id, content, status (pending|scheduled|posted|failed), 
type (manual|generated|attribution), scheduled_at, 
posted_at, error, source_url, created_at, updated_at
```

#### **trial_info** (New)
```sql
id (1), install_date, posts_count
```

#### **settings** (Existing, extended)
```sql
key, value
-- keys: openai_api_key, scheduler_enabled, scheduler_start_time, 
-- scheduler_end_time, scheduler_posts_per_day, work_contexts (JSON), etc.
```

### 🎨 Design System

Using **Lamborghini Dark Theme** from DESIGN.md:
- **Black Canvas**: `#000000`
- **Gold Accents**: `#FFC000`
- **White Text**: `#FFFFFF`  
- **Dark Gray Cards**: `#202020`
- **Zero Border Radius**: `0px` on all buttons/cards
- **Uppercase Headers**: Aggressive, authoritative
- **Minimal Layout**: Content-focused, no clutter

### 🔐 Security Features

1. **Symmetric Encryption** (`license.js`):
   - AES-256-CBC encryption for license keys
   - HMAC-based signature verification
   - No server required for validation

2. **Hardware Locking**:
   - Computer ID from MAC address + hostname (SHA-256 hash)
   - Each license tied to specific hardware
   - 2-device activation limit

3. **API Key Protection**:
   - OpenAI keys stored locally + encrypted
   - Never transmitted to any server (except OpenAI API calls)
   - User has full control

4. **No Cloud Dependency**:
   - All data stored locally
   - License validation happens offline
   - Posts stored in SQLite database

### 📋 Free vs Paid Tier

| Feature | Free (7 days) | Paid (One-Time) |
|---------|---------------|-----------------|
| Posts/Day | 2 max | Unlimited |
| Work Contexts | 1 only | Multiple |
| Attribution Post | Mandatory | Optional |
| License Devices | 1 | 2 max |
| Cost | Free | One-time |
| Expiration | 7 days | Never |

### 🚀 Next Steps to Launch

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Update .env**:
   ```
   OPENAI_MODEL=gpt-4o-mini
   PURCHASE_URL=https://your-purchase-link.com
   ```

3. **Development Mode**:
   ```bash
   npm run dev
   ```

4. **Build for Distribution**:
   ```bash
   npm run build:mac      # macOS
   npm run build:win      # Windows
   ```

5. **Generate License Keys** (Admin only):
   - Use `license.js` generateLicense() function
   - Sign with private admin key
   - Distribute to customers

### ⚠️ Important Notes

- **No Email/Approval**: Removed email-based approval workflow
- **No Pipelines**: Single daily scheduler only (no work_context/rss_review pipelines)
- **BYOK Model**: Users bring their own OpenAI API key
- **Hardware-Locked**: License keys tied to computer hardware
- **Symmetric Keys**: No licensing server needed
- **One Purchase**: Perpetual license, no subscription

### 📞 Support

Refer to:
- [Tutorials Page](src/pages/Tutorials.jsx) - Getting started
- [FAQs Page](src/pages/FAQs.jsx) - Common questions
- [Terms Page](src/pages/Terms.jsx) - License agreement
- [Privacy Page](src/pages/Privacy.jsx) - Data handling

---

**Version**: 1.0.0  
**Built**: April 2026  
**License Model**: One-time purchase (perpetual, 2-device limit)  
**Theme**: Lamborghini Dark Design System
