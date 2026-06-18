# Roadmaps

Roadmaps helps small teams plan work and agree on priorities together. It is a self-hosted tool for businesses that need clarity across stakeholders—not a heavyweight enterprise platform. You can organize people into teams, but the focus stays practical: lightweight sessions that help you decide what to build and when.

## What's inside

Three session types, each built for a different kind of conversation:

- **Roadmap** — Cycle-based long-term planning across current and future cycles.
- **Dot voting** — Facilitate agreement among stakeholders and prioritize which issues to work on next.
- **Alignment voting** — See where stakeholders align on different aspects of an issue.

Built on Cloudflare Workers + Durable Objects (SQLite). No D1 required.

## Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with SESSION_SECRET, bootstrap admin, etc.
pnpm dev
```

Open `http://localhost:5173`, sign in with bootstrap credentials, and change your password on first login.

## Documentation

- [Setup](docs/SETUP.md) — deployment, email, Linear, and AI configuration
- [Security](docs/SECURITY.md) — user and app security model
- [React Doctor](docs/react-doctor.md) — scan usage and ignored-rule rationale

## Adding UI components

This project uses [shadcn/ui](https://ui.shadcn.com/):

```bash
pnpm dlx shadcn@latest add button
```

## License

MIT
