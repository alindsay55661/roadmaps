# Roadmaps Setup Guide

## Requirements

- Node.js 20+
- pnpm 11+
- Cloudflare account (for deployment)

## Environment variables

Copy `.dev.vars.example` to `.dev.vars` for local development. For production, set secrets via `wrangler secret put`.

### Required

| Variable                   | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `SESSION_SECRET`           | Random string for signing session cookies                  |
| `APP_URL`                  | Public URL (e.g. `https://roadmaps.example.com`)           |
| `BOOTSTRAP_ADMIN_EMAIL`    | First admin email (one-time seed)                          |
| `BOOTSTRAP_ADMIN_PASSWORD` | First admin password (one-time; user must change on login) |

### Email (required for production)

Invite-only registration and password reset require an email provider.

| Variable         | Description                         |
| ---------------- | ----------------------------------- |
| `EMAIL_PROVIDER` | `resend`, `postmark`, or `sendgrid` |
| `EMAIL_FROM`     | Sender address                      |

Provider-specific keys:

- Resend: `RESEND_API_KEY`
- Postmark: `POSTMARK_SERVER_TOKEN`
- SendGrid: `SENDGRID_API_KEY`

Transactional email content lives in `packages/email/templates`. In local development, if `EMAIL_PROVIDER` or `EMAIL_FROM` is unset, `sendEmail` logs the full payload (subject, HTML, and plain text) to the worker console instead of sending — useful for previewing invite, password-reset, and session-share emails.

### Linear import (optional)

| Variable         | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `LINEAR_API_KEY` | Linear API key for importing issues into any session |

When configured, session pages show an **Import from Linear** tab inside **Add items**. The import flow:

1. Open **Add items** → **Import from Linear**
2. Optionally filter by project, label, date range, or search text
3. Click **Fetch Issues** to load matching issues from Linear
4. Select issues to import (sub-issues can be excluded)
5. Choose skip or overwrite for items already linked by Linear ID
6. Optionally enable **Summarize descriptions with AI** (requires AI env vars below)

### AI summarization (optional)

Uses the Vercel AI SDK. Set `AI_PROVIDER` and the matching API key.

| Variable      | Description                                           |
| ------------- | ----------------------------------------------------- |
| `AI_PROVIDER` | `google`, `openai`, `anthropic`, or `openrouter`      |
| `AI_MODEL`    | Model id (e.g. `gemini-2.5-flash`, `gpt-4o`)          |
| `AI_BASE_URL` | Optional custom base URL (e.g. Cloudflare AI Gateway) |

Provider keys:

- Google (AI Studio): `GOOGLE_AI_STUDIO_API_KEY` — create at [aistudio.google.com](https://aistudio.google.com/apikey). Optional `GOOGLE_AI_STUDIO_BASE_URL` for AI Gateway.
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- OpenRouter: `OPENROUTER_API_KEY`

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

## Deploy

```bash
pnpm build
wrangler secret put SESSION_SECRET
wrangler secret put BOOTSTRAP_ADMIN_EMAIL
wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
# ... other secrets
pnpm deploy
```

## Architecture

- **SystemAgent** — users, invites, password reset tokens
- **UserAgent** — personal drafts + shared-with-me index
- **TeamAgent** — team members + team session list
- **Session DOs** — Roadmap, Voting, Alignment voting content

Teams provide org-wide visibility (Figma-style team switcher). Owners can also one-off share sessions with specific users.

## UI components

Add shadcn components as needed:

```bash
pnpm dlx shadcn@latest add dialog tabs select
```

Configuration lives in `components.json`.
