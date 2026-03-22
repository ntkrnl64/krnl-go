# krnl.go

A self-hosted URL shortener running entirely on Cloudflare Workers + D1. No external database, no server — just a Worker, a D1 SQLite database, and a React SPA.

## Features

- Create, edit, and delete short links
- Alias support — multiple IDs pointing to one destination (e.g. `/siiway` and `/sw` → `https://siiway.org`); auto-merges when you add a link with a URL that already exists
- Interstitial redirect page with configurable countdown timer (per-link or global default)
- Optional link title and description shown on the interstitial page
- Password-protected admin panel with session tokens (PBKDF2-hashed, stored in D1)
- Change admin password from the UI
- `KRNLGO_NO_TOKEN` env var to bypass token auth entirely (for use behind Cloudflare Access)
- Dark mode UI built with Fluent UI v9

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) (`npm i -g pnpm`)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — installed automatically as a dev dependency

## Deploy

### 1. Clone and install

```sh
git clone https://github.com/ntkrnl64/krnl-go
cd krnl-go
pnpm install
```

### 2. Create a D1 database

```sh
pnpm wrangler d1 create krnl-go
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
pnpm wrangler d1 migrations apply krnl-go
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
pnpm build
pnpm wrangler deploy
```

### 5. First-run setup

Open the deployed URL in your browser. You'll be prompted to set an admin password (minimum 8 characters). After that, log in to access the admin panel.

---

## Local development

```sh
pnpm dev
```

This starts both the Vite dev server and a local Wrangler instance via `wrangler dev`. The frontend proxies API requests to the Worker automatically.

D1 uses a local SQLite file automatically during `wrangler dev` — no extra setup needed. To apply migrations locally:

```sh
pnpm wrangler d1 migrations apply krnl-go --local
```

---

## Configuration

### Bypass token auth (`KRNLGO_NO_TOKEN`)

If your deployment is protected by [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) or another auth proxy, you can disable the built-in password check entirely by setting the `KRNLGO_NO_TOKEN` environment variable to any value.

Set it via the Cloudflare dashboard (**Workers & Pages → your worker → Settings → Variables**), or add it to `wrangler.jsonc` for local testing:

```jsonc
"vars": {
  "KRNLGO_NO_TOKEN": "1"
}
```

When this variable is set:

- The login screen is skipped
- The "Sign out" and "Password" buttons are hidden in the admin panel
- All API routes are accessible without a Bearer token

### Global interstitial settings

From the admin panel, open **Settings** to configure:

- Whether to show an interstitial page by default
- The default title and description shown on the interstitial
- The default redirect countdown delay (seconds; `0` = no auto-redirect)

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
pnpm wrangler d1 migrations apply krnl-go
pnpm build
pnpm wrangler deploy
```

### 3. Run the migration

Send an authenticated POST request to the migration endpoint:

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

## Tech stack

| Layer      | Technology                        |
| ---------- | --------------------------------- |
| Runtime    | Cloudflare Workers                |
| Storage    | Cloudflare D1 (SQLite)            |
| Frontend   | React + Vite                      |
| UI         | Fluent UI v9                      |
| Auth       | PBKDF2 (100k iterations, SHA-256) |
| Deployment | Wrangler                          |

---

## License

GNU General Public License 3.0. See [LICENSE](./LICENSE) for details.

### Icon

This project uses [microsoft](https://github.com/microsoft)'s [fluentui-system-icons](https://github.com/microsoft/fluentui-system-icons) for its icon(s). See [THIRD_PARTY_LICENSES/fluentui-system-icons](./THIRD_PARTY_LICENSES/fluentui-system-icons) for details.
