# krnl.go

A self-hosted URL shortener running entirely on Cloudflare Workers + KV. No database, no server — just a Worker and a React SPA.

## Features

- Create, edit, and delete short links
- Alias support — multiple IDs pointing to one destination (e.g. `/siiway` and `/sw` → `https://siiway.org`); auto-merges when you add a link with a URL that already exists
- Interstitial redirect page with configurable countdown timer (per-link or global default)
- Optional link title and description shown on the interstitial page
- Password-protected admin panel with session tokens (PBKDF2-hashed, stored in KV)
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

### 2. Create a KV namespace

```sh
pnpm wrangler kv namespace create LINKS
```

Copy the `id` from the output and paste it into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "LINKS",
    "id": "<your-namespace-id>"
  }
]
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

To use a local KV namespace for dev, run:

```sh
pnpm wrangler kv namespace create LINKS --preview
```

Then add the `preview_id` to `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "LINKS",
    "id": "<production-id>",
    "preview_id": "<preview-id>"
  }
]
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
| Storage    | Cloudflare KV                     |
| Frontend   | React + Vite                      |
| UI         | Fluent UI v9                      |
| Auth       | PBKDF2 (100k iterations, SHA-256) |
| Deployment | Wrangler                          |

---

## License

GNU General Public License 3.0. See [LICENSE](./LICENSE) for details.

### Icon

This project uses [microsoft](https://github.com/microsoft)'s [fluentui-system-icons](https://github.com/microsoft/fluentui-system-icons) for its icon(s). See [THIRD_PARTY_LICENSES/fluentui-system-icons](./THIRD_PARTY_LICENSES/fluentui-system-icons) for details.
