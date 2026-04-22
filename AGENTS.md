# AGENTS.md

## Scope

Instructions for LLM agents operating this repository.

## Primary Entry Points

- Login session refresh: `node login.js`
- Scheduler: `node scheduler.js`
- Web admin: `npm run web:start`
- Manual post flow: `node post-now.js`
- Auto-approved manual flow: `npm run post-now:auto`

## Platform Notes

- macOS, Linux, and Windows are supported.
- Local confirmation uses AppleScript on macOS and browser fallback elsewhere.

## Pipelines

- `work_context` (3-hour cadence)
- `rss_review` (6-hour cadence)

## Posting Modes

- `confirm_email`
- `confirm_push`
- `auto`

## Agent Behavior Rules

- Do not print secret values from `.env`.
- Verify command outcomes and summarize results clearly.
- When troubleshooting generation, test backend functions directly before editing UI code.
- Keep changes minimal and scoped to the user request.

## Recommended Doc References

- `README.md`
- `LLM_OPERATOR_GUIDE.md`
- `.github/skills/linkedin-bot-ops/SKILL.md`
