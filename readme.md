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

## Running on a bare (raw) machine — Windows, Linux or macOS

If you are starting from a fresh OS install with nothing pre-installed, follow the section for your platform. The only software you need is **Node.js ≥ 20** (it includes `npm`) and a reachable **PostgreSQL ≥ 9.4** server.

### Step 0 — Install prerequisites (per platform)

#### Windows 10/11
1. Install Git: download from https://git-scm.com/download/win and run the installer with default options.
2. Install Node.js LTS (≥ 20): https://nodejs.org/ — use the Windows x64 Installer.
3. Open **PowerShell** (or Command Prompt) and verify:
   ```powershell
   git --version
   node --version    # must print v20.x or newer
   npm --version
   ```
4. PostgreSQL (skip if you already have a database to connect to). Easiest options:
   - Official installer: https://www.postgresql.org/download/windows/ (remember the password you set for the `postgres` user), **or**
   - Docker: `docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`

#### macOS (Intel or Apple Silicon)
1. Install the Command Line Tools (gives you `git`): open **Terminal** and run `xcode-select --install`.
2. Install Homebrew (if you don't have it): https://brew.sh
3. Install Node.js LTS:
   ```bash
   brew install node@22   # or download the pkg installer from https://nodejs.org
   node --version         # v20+ 
   ```
4. PostgreSQL (optional local DB):
   ```bash
   brew install postgresql@16
   brew services start postgresql@16
   # or with Docker:
   docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
   ```

#### Linux (Debian / Ubuntu)
```bash
sudo apt update
sudo apt install -y git curl ca-certificates
# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version
# Optional local PostgreSQL:
sudo apt install -y postgresql        # starts automatically on port 5432
# or Docker:
# docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

#### Linux (Fedora / RHEL)
```bash
sudo dnf install -y git nodejs npm     # Fedora 38+ ships Node 20+
# Optional local PostgreSQL:
sudo dnf install -y postgresql-server postgresql-contrib
sudo postgresql-setup --initdb && sudo systemctl start postgresql
```

### Step 1 — Get the code and run it

```bash
git clone https://github.com/MehdiFathipour/temp.git pg-viewer
cd pg-viewer
npm install
```

Then pick the mode you want (works identically on Windows/macOS/Linux):

```bash
# Web app, single process (builds UI, serves API + UI on http://localhost:3001)
npm start            # Windows: npm.cmd start if PowerShell blocks npm.ps1

# Development (hot reload: API on :3001, Vite UI on :5173)
npm run dev

# Desktop app in a native window (Electron)
npm install -D electron          # one-time extra dependency
npm run desktop

# Build a distributable installer for your OS (NSIS .exe / .dmg / AppImage+deb)
npm install -D electron electron-builder
npm run desktop:dist             # output lands in release/
```

Open **http://localhost:3001** (web mode) or launch the packaged app, click **New Connection**, and enter either:
- Host `localhost`, Port `5432`, User `postgres`, Password `postgres`, Database `postgres` (matches the Docker command above), or
- A connection URI such as `postgres://user:pass@host:5432/dbname` (SSL toggle available for hosted DBs like RDS/Supabase/Neon).

### Troubleshooting on raw systems

| Symptom | Fix |
|---|---|
| `npm` not found after installing on Windows | Reopen the terminal (PATH updates require a new shell) |
| PowerShell "running scripts is disabled" | Use Command Prompt, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `EACCES` on `npm install -g` style steps (Linux/macOS) | Don't use sudo; this project installs locally into `./node_modules` |
| Port 3001/5173 already in use | Set `PORT=3005` before `npm start` (`$env:PORT=3005` in PowerShell) |
| `Connection failed: … authentication failed` | Check the Postgres user/password; for peer-auth local installs create a password login: `ALTER USER postgres PASSWORD 'postgres';` |
| Old Node version | Install Node 20+ via https://nodejs.org or `nvm install 20 && nvm use 20` |

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
