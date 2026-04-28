# krnl.go

A self-hosted URL shortener running entirely on Cloudflare Workers + D1. No external database, no server — just a Worker, a D1 SQLite database, and a React SPA.

## Features

- Create, edit, and delete short links
- Alias support — multiple IDs pointing to one destination (e.g. `/siiway` and `/sw` → `https://siiway.org`); auto-merges when you add a link with a URL that already exists
- Multi-destination links — one short ID with a chooser page and optional auto-redirect weighting
- Interstitial redirect page with configurable countdown timer (per-link or global default)
- Optional reverse-proxy mode (per-link or global default)
- Optional custom JS hooks (frontend interstitial + backend on-redirect via Dynamic Workers)
- Optional link title and description shown on the interstitial page
- **Auth via [Prism](https://github.com/siiway/prism) (OAuth 2.0 / OIDC)** — config stored in D1, configurable from the UI
- Password admin available as a fallback; one-click migrate to Prism from the admin panel
- `KRNLGO_NO_TOKEN` env var to bypass token auth entirely (for use behind Cloudflare Access)
- Dark mode UI built with Fluent UI v9

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — installed automatically as a dev dependency

## Deploy

### 1. Clone and install

```sh
git clone https://github.com/ntkrnl64/krnl-go
cd krnl-go
bun install
```

### 2. Create a D1 database

```sh
bun wrangler d1 create krnl-go
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "krnl-go",
    "database_id": "<your-database-id>",
    "migrations_dir": "migrations"
  }
]
```

Then apply the schema migrations:

```sh
bun wrangler d1 migrations apply krnl-go
```

### 3. (Optional) Configure a custom domain

In `wrangler.jsonc`, update the `routes` section:

```jsonc
"routes": [
  {
    "pattern": "go.yourdomain.com",
    "custom_domain": true
  }
]
```

Or you can just remove the `routes` key entirely to use a `*.workers.dev` subdomain instead.

### 4. Build and deploy

```sh
bun run build
bun wrangler deploy
```

### 5. First-run setup

Open the deployed URL in your browser. You'll see a setup screen with two paths:

- **Configure Prism** — enter your Prism instance URL, OAuth client ID, and client secret. They're saved to D1. Then click **Claim admin with Prism** to bind your Prism account as the sole admin.
- **Set a password** — fall back to the legacy password admin (you can migrate to Prism later).

The first claim wins. Once a Prism account is bound, **no other Prism account can ever sign in**, even via re-claim or re-migrate.

---

## Local development

```sh
bun dev
```

This starts both the Vite dev server and a local Wrangler instance via `wrangler dev`. The frontend proxies API requests to the Worker automatically.

D1 uses a local SQLite file automatically during `wrangler dev` — no extra setup needed. To apply migrations locally:

```sh
bun wrangler d1 migrations apply krnl-go --local
```

---

## Authentication

### Prism (recommended)

[Prism](https://github.com/siiway/prism) is a self-hosted OAuth 2.0 / OpenID Connect identity platform. krnl.go integrates with it as a relying party using the [`@siiway/prism`](https://www.npmjs.com/package/@siiway/prism) SDK.

**Where the config lives.** Prism client credentials are stored in the `prism_config` table in D1 and are editable from the admin panel under **Prism**. As a fallback, the worker also reads `PRISM_BASE_URL`, `PRISM_CLIENT_ID`, and `PRISM_CLIENT_SECRET` env vars — DB config takes precedence when both are present.

#### Set up Prism for the first time

1. In your Prism instance, go to **Apps → New Application** and register an OAuth app.
2. Set the redirect URI to `https://<your-domain>/api/auth/prism/callback`.
3. Allow the `openid`, `profile`, and `email` scopes.
4. Copy the **Client ID** and **Client Secret**.
5. Open krnl.go in a browser. On the setup screen, click **Configure Prism**, paste the values, and **Save and continue**.
6. Click **Claim admin with Prism** — you'll be redirected to Prism, sign in, and come back as admin.

#### Single-admin lockdown

The first Prism subject (`sub`) to claim or migrate becomes the sole admin. Every subsequent attempt fails:

- `claim` is blocked because an admin already exists.
- `migrate` is blocked because the admin is already bound to a Prism account.
- `login` only succeeds when the returned `sub` matches the bound `admin.sub`.

To "reset" admin you must edit the D1 `admin` table directly (e.g. `UPDATE admin SET sub = NULL WHERE id = 1`).

#### Migrating from password to Prism

If you set up with a password and later want to use Prism:

1. Sign in with your password.
2. Open the **Prism** dialog (header) and configure your Prism app credentials.
3. Click **Migrate to Prism** in the header. You'll be sent to Prism to sign in. On return, your Prism account is bound and the password is cleared.

#### Env-var fallback

If you'd rather not put secrets in D1, set them via wrangler instead:

```sh
# In wrangler.jsonc:
"vars": {
  "PRISM_BASE_URL": "https://id.example.com",
  "PRISM_CLIENT_ID": "your-client-id"
}

# Then upload the secret separately:
bun wrangler secret put PRISM_CLIENT_SECRET
```

### Password (fallback)

Skipping Prism on the setup screen sets up password admin (PBKDF2, 100k iterations, SHA-256). Sessions are stored in D1. Change your password from the admin **Password** button. Password login is automatically disabled once a Prism account is bound.

### Bypass token auth (`KRNLGO_NO_TOKEN`)

If your deployment is protected by [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) or another auth proxy, disable the built-in check by setting the `KRNLGO_NO_TOKEN` environment variable to any value.

```jsonc
"vars": {
  "KRNLGO_NO_TOKEN": "1"
}
```

When this variable is set, the login screen is skipped, the auth-related buttons are hidden in the admin panel, and all API routes are accessible without a Bearer token.

---

## Configuration

### Global interstitial settings

From the admin panel, open **Settings** to configure:

- Whether to show an interstitial page by default
- The default title and description shown on the interstitial
- The default redirect countdown delay (seconds; `0` = no auto-redirect)
- Whether to reverse-proxy by default

These can be overridden per-link when creating or editing a link.

---

## Migrating from KV to D1

If you have an existing deployment that uses KV, you can migrate your data to D1:

### 1. Add the legacy KV binding

In `wrangler.jsonc`, add your old KV namespace alongside the D1 database:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "krnl-go",
    "database_id": "<your-database-id>",
    "migrations_dir": "migrations"
  }
],
"kv_namespaces": [
  {
    "binding": "LEGACY_KV",
    "id": "<your-old-kv-namespace-id>"
  }
]
```

### 2. Apply D1 migrations and deploy

```sh
bun wrangler d1 migrations apply krnl-go
bun run build
bun wrangler deploy
```

### 3. Run the migration

Send an authenticated POST request to the migration endpoint, or click **Migrate KV** in the admin panel.

```sh
curl -X POST https://your-worker-url/api/migrate-kv \
  -H "Authorization: Bearer <your-token>"
```

The response will show what was migrated:

```json
{ "ok": true, "migrated": { "links": 12, "aliases": 3, "admin": true, "config": true } }
```

### 4. Clean up

Once you've verified everything works, remove the `kv_namespaces` block from `wrangler.jsonc` and redeploy. You can then delete the KV namespace from the Cloudflare dashboard.

---

## Aliases

Aliases let multiple short IDs point to the same destination URL.

**Auto-merge:** When you create a new link and the destination URL already exists, the new ID is automatically created as an alias of the existing link rather than a duplicate entry.

**Manual aliases:** Open a link's edit dialog and use the **Aliases** section to add or remove alias IDs at any time.

All aliases share the same destination, title, description, interstitial setting, and redirect delay as the primary link.

---

## API endpoints

Auth-related endpoints (token = the session token returned by `/api/auth` or set by the OAuth callback):

| Method | Path                         | Auth          | Purpose                                                          |
| ------ | ---------------------------- | ------------- | ---------------------------------------------------------------- |
| GET    | `/api/status`                | none          | Setup state, Prism flags, KV migration pending                   |
| POST   | `/api/setup`                 | none          | Create the password admin (only when none exists)                |
| POST   | `/api/auth`                  | none          | Password login (disabled when Prism-bound)                       |
| POST   | `/api/logout`                | bearer        | Invalidate the current session                                   |
| POST   | `/api/password`              | bearer        | Change password (disabled when Prism-bound)                      |
| POST   | `/api/auth/prism/start`      | varies        | Begin OAuth flow; body `{ intent: 'login' \| 'claim' \| 'migrate' }`. `migrate` requires bearer. |
| GET    | `/api/auth/prism/callback`   | OAuth code    | OAuth code exchange; sets session via inline JS                  |
| GET    | `/api/prism/config`          | bearer¹       | Read DB-stored Prism config (never returns secret)               |
| PUT    | `/api/prism/config`          | bearer¹       | Save Prism config to D1                                          |
| DELETE | `/api/prism/config`          | bearer        | Clear DB config (blocked when Prism-bound)                       |

¹ Allowed without a bearer token only when no admin row exists yet (init mode).

---

## Tech stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Runtime    | Cloudflare Workers                  |
| Storage    | Cloudflare D1 (SQLite)              |
| Frontend   | React + Vite                        |
| UI         | Fluent UI v9                        |
| Auth       | Prism OAuth 2.0 / OIDC (PBKDF2 fallback) |
| OAuth SDK  | [`@siiway/prism`](https://www.npmjs.com/package/@siiway/prism) |
| Deployment | Wrangler                            |

---

## License

GNU General Public License 3.0. See [LICENSE](./LICENSE) for details.

### Icon

This project uses [microsoft](https://github.com/microsoft)'s [fluentui-system-icons](https://github.com/microsoft/fluentui-system-icons) for its icon(s). See [THIRD_PARTY_LICENSES/fluentui-system-icons](./THIRD_PARTY_LICENSES/fluentui-system-icons) for details.
