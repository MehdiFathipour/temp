# PG Viewer — Cross-platform PostgreSQL Viewer

A general-purpose PostgreSQL viewer that runs **anywhere**:

- 🖥 **Desktop app** (Windows / macOS / Linux) via Electron
- 🌐 **Web app** served by a small Express API (self-host or run locally)
- Any PostgreSQL ≥ 9.4 — local, Docker, RDS, Supabase, Neon, etc.

## Features

- Connect by host/port/user/password/database **or** a `postgres://` connection URI (with SSL option)
- Saved connections persist in the browser/Electron `localStorage`
- Object explorer tree: schemas → tables / views / functions (with row-count badges)
- **Data browser**: paginated table browsing, click-to-sort headers, ad-hoc `WHERE` filter, CSV export of the current page, click-to-copy cells
- **Table details**: columns (types, nullability, defaults, PK/identity/generated), constraints, indexes, triggers, generated `CREATE TABLE` DDL
- **Schema overview**: per-table disk usage with share bars, server stats (version, DB size, connections)
- **SQL editor**: run any statement (Ctrl/⌘+Enter), row limit, statement timeout, result grid, CSV/JSON export, query history
- Views & functions show their definitions directly

## Architecture

```
server/    Express + pg API (connection pool manager, catalog metadata queries)
src/       React (Vite) frontend
electron/  Desktop shell that boots the API on a random port and loads the UI
tests/     Node built-in test runner unit tests
```

The frontend talks to `/api/*`. In production the Express server also serves the built static UI, so one process is all you need. Electron reuses the exact same server in-process.

## Quick start

Requirements: Node.js ≥ 20.

```bash
npm install

# Development (API on :3001 with --watch, Vite UI on :5173 with proxy)
npm run dev

# Production web mode (builds UI, serves everything from http://localhost:3001)
npm start

# Desktop app (builds UI, launches Electron window)
npm run desktop

# Package installers for the current OS (NSIS / DMG / AppImage+deb)
npm install -D electron electron-builder   # optional heavy deps, not required for web/dev use
npm run desktop:dist

# Unit tests
npm test
```

### Environment variables

| Var    | Default | Description                                        |
|--------|---------|----------------------------------------------------|
| `PORT` | `3001`  | HTTP/API port for `npm start` / `npm run dev:server` |

You can also drop a `.env` file next to the project root (`dotenv` is a dependency).

## Security notes

- Passwords are held only in the server's memory (per live connection) and in your browser's `localStorage` for saved connections. The API never returns passwords, and URIs are redacted in responses.
- The server accepts arbitrary SQL by design (it is a DB client). Bind it to `localhost` or protect it if exposing remotely.
- All catalog queries use parameterized statements; identifiers in browse queries are double-quote escaped; `orderBy` is validated against an identifier regex.

## Roadmap ideas

- Editable data grid (INSERT/UPDATE/DELETE generation)
- ER-diagram view per schema
- Multiple simultaneous connections & database switcher
- SSH tunnel support
