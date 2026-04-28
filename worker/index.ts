import { PrismClient } from "@siiway/prism";

interface MultiDestination {
  id?: number;
  url: string;
  title: string;
  groupName?: string;
  groupTitle?: string;
  groupDescription?: string;
  autoRedirectChance: number; // 0–100
  position: number;
}

interface LinkData {
  url: string;
  createdAt: number;
  title?: string;
  description?: string;
  interstitial?: boolean; // undefined = use global default
  redirectDelay?: number; // seconds; undefined = use global default, 0 = disabled
  proxy?: boolean; // undefined = use global default
  aliases?: string[]; // other IDs that redirect here
  multi?: boolean;
  destinations?: MultiDestination[];
  customJsFrontend?: string;
  customJsBackend?: string;
}

interface GlobalConfig {
  defaultInterstitial: boolean;
  interstitialTitle: string;
  interstitialDescription: string;
  redirectDelay: number; // seconds; 0 = no auto-redirect
  defaultProxy: boolean;
}

const DEFAULT_CONFIG: GlobalConfig = {
  defaultInterstitial: false,
  interstitialTitle: "You are being redirected",
  interstitialDescription: "You are about to visit an external website.",
  redirectDelay: 0,
  defaultProxy: false,
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hashPassword(
  password: string,
  salt?: Uint8Array,
): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(
    salt ?? crypto.getRandomValues(new Uint8Array(16)),
  );
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(saltBytes) };
}

async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, fromBase64(storedSalt));
  return hash === storedHash;
}

function generateToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (b) => chars[b % chars.length],
  ).join("");
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

interface AdminRow {
  hash: string | null;
  salt: string | null;
  sub: string | null;
}

async function getAdmin(env: Env): Promise<AdminRow | null> {
  return env.DB.prepare(
    "SELECT hash, salt, sub FROM admin WHERE id = 1",
  ).first<AdminRow>();
}

function getPrismRedirectUri(request: Request): string {
  return new URL("/api/auth/prism/callback", request.url).toString();
}

interface PrismConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  source: "db" | "env";
}

async function getPrismConfig(env: Env): Promise<PrismConfig | null> {
  // DB config takes precedence over env vars
  const row = await env.DB.prepare(
    "SELECT base_url, client_id, client_secret FROM prism_config WHERE id = 1",
  ).first<{ base_url: string; client_id: string; client_secret: string }>();
  if (row) {
    return {
      baseUrl: row.base_url,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      source: "db",
    };
  }
  if (env.PRISM_BASE_URL && env.PRISM_CLIENT_ID && env.PRISM_CLIENT_SECRET) {
    return {
      baseUrl: env.PRISM_BASE_URL,
      clientId: env.PRISM_CLIENT_ID,
      clientSecret: env.PRISM_CLIENT_SECRET,
      source: "env",
    };
  }
  return null;
}

async function getPrismClient(
  env: Env,
  request: Request,
): Promise<PrismClient | null> {
  const config = await getPrismConfig(env);
  if (!config) return null;
  return new PrismClient({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: getPrismRedirectUri(request),
    scopes: ["openid", "profile", "email"],
  });
}

async function mintSession(env: Env): Promise<string> {
  const token = generateToken();
  await env.DB.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, ?)")
    .bind(token, Date.now() + 86400 * 1000)
    .run();
  return token;
}

/** HTML response that stashes the session token in localStorage and redirects
 *  to `/`. Used by the OAuth callback so the existing localStorage-based
 *  frontend keeps working without a server-set cookie. */
function sessionHandoff(token: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>Signing in…</title>
<script>try{localStorage.setItem('krnl_go_token',${JSON.stringify(token)})}catch(e){}location.replace('/')</script>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function oauthError(message: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#222}a{color:#0078d4}</style>
<h1>Sign-in failed</h1><p>${message.replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p><p><a href="/">Back to start</a></p>`;
  return new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function getAuth(request: Request, env: Env): Promise<boolean> {
  if (env.KRNLGO_NO_TOKEN !== undefined) return true;
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const row = await env.DB.prepare(
    "SELECT 1 FROM sessions WHERE token = ? AND expires_at > ?",
  )
    .bind(token, Date.now())
    .first();
  return row !== null;
}

async function serveIndex(request: Request, env: Env): Promise<Response> {
  return env.ASSETS.fetch(
    new Request(new URL("/index.html", request.url).toString()),
  );
}

async function getConfig(env: Env): Promise<GlobalConfig> {
  const row = await env.DB.prepare("SELECT * FROM config WHERE id = 1").first<{
    default_interstitial: number;
    interstitial_title: string;
    interstitial_description: string;
    redirect_delay: number;
    default_proxy: number;
  }>();
  if (!row) return DEFAULT_CONFIG;
  return {
    defaultInterstitial: row.default_interstitial === 1,
    interstitialTitle: row.interstitial_title,
    interstitialDescription: row.interstitial_description,
    redirectDelay: row.redirect_delay,
    defaultProxy: row.default_proxy === 1,
  };
}

/** Loads multi-destinations for a link. */
async function getMultiDestinations(
  env: Env,
  linkId: string,
): Promise<MultiDestination[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM multi_destinations WHERE link_id = ? ORDER BY position",
  )
    .bind(linkId)
    .all<{
      id: number;
      link_id: string;
      url: string;
      title: string;
      group_name: string | null;
      group_title: string | null;
      group_description: string | null;
      auto_redirect_chance: number;
      position: number;
    }>();
  return results.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    ...(r.group_name ? { groupName: r.group_name } : {}),
    ...(r.group_title ? { groupTitle: r.group_title } : {}),
    ...(r.group_description ? { groupDescription: r.group_description } : {}),
    autoRedirectChance: r.auto_redirect_chance,
    position: r.position,
  }));
}

/** Saves multi-destinations for a link (replace all). */
async function saveMultiDestinations(
  env: Env,
  linkId: string,
  destinations: MultiDestination[],
): Promise<void> {
  await env.DB.prepare("DELETE FROM multi_destinations WHERE link_id = ?")
    .bind(linkId)
    .run();
  for (let i = 0; i < destinations.length; i++) {
    const d = destinations[i];
    await env.DB.prepare(
      `INSERT INTO multi_destinations (link_id, url, title, group_name, group_title, group_description, auto_redirect_chance, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        linkId,
        d.url,
        d.title,
        d.groupName ?? null,
        d.groupTitle ?? null,
        d.groupDescription ?? null,
        d.autoRedirectChance,
        d.position ?? i,
      )
      .run();
  }
}

/** Loads aliases for a primary link. */
async function getAliases(env: Env, primaryId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT alias_id FROM aliases WHERE primary_id = ?",
  )
    .bind(primaryId)
    .all<{ alias_id: string }>();
  return results.map((r) => r.alias_id);
}

/** Loads a LinkData object from the links table + its aliases + multi-destinations. */
async function getLink(env: Env, id: string): Promise<LinkData | null> {
  const row = await env.DB.prepare("SELECT * FROM links WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      url: string;
      created_at: number;
      title: string | null;
      description: string | null;
      interstitial: number | null;
      redirect_delay: number | null;
      proxy: number | null;
      multi: number | null;
      custom_js_frontend: string | null;
      custom_js_backend: string | null;
    }>();
  if (!row) return null;
  const aliases = await getAliases(env, id);
  const isMulti = row.multi === 1;
  const destinations = isMulti ? await getMultiDestinations(env, id) : [];
  return {
    url: row.url,
    createdAt: row.created_at,
    ...(row.title ? { title: row.title } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.interstitial !== null
      ? { interstitial: row.interstitial === 1 }
      : {}),
    ...(row.redirect_delay !== null
      ? { redirectDelay: row.redirect_delay }
      : {}),
    ...(row.proxy !== null ? { proxy: row.proxy === 1 } : {}),
    ...(aliases.length ? { aliases } : {}),
    ...(isMulti ? { multi: true, destinations } : {}),
    ...(row.custom_js_frontend
      ? { customJsFrontend: row.custom_js_frontend }
      : {}),
    ...(row.custom_js_backend
      ? { customJsBackend: row.custom_js_backend }
      : {}),
  };
}

/** Resolves an ID to its primary link data, following aliases one level. */
async function resolveToLink(
  env: Env,
  id: string,
): Promise<{ id: string; data: LinkData } | null> {
  // Check if it's an alias first
  const alias = await env.DB.prepare(
    "SELECT primary_id FROM aliases WHERE alias_id = ?",
  )
    .bind(id)
    .first<{ primary_id: string }>();

  const primaryId = alias ? alias.primary_id : id;
  const data = await getLink(env, primaryId);
  if (!data) return null;
  return { id: primaryId, data };
}

/** Finds a primary link matching a URL (used for auto-merge). */
async function findLinkByUrl(
  env: Env,
  url: string,
): Promise<{ id: string; data: LinkData } | null> {
  const row = await env.DB.prepare("SELECT id FROM links WHERE url = ? LIMIT 1")
    .bind(url)
    .first<{ id: string }>();
  if (!row) return null;
  const data = await getLink(env, row.id);
  if (!data) return null;
  return { id: row.id, data };
}

type TriStateMode = "default" | "always" | "never";

interface LinkPayload {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  interstitial?: TriStateMode;
  redirectDelay?: number | null;
  proxy?: TriStateMode;
  multi?: boolean;
  destinations?: MultiDestination[];
  customJsFrontend?: string | null;
  customJsBackend?: string | null;
}

function applyLinkPayload(
  existing: Partial<LinkData>,
  body: LinkPayload,
): LinkData {
  const base: LinkData = {
    url: body.url,
    createdAt: existing.createdAt ?? Date.now(),
    ...(body.title ? { title: body.title } : {}),
    ...(body.description ? { description: body.description } : {}),
  };
  if (body.interstitial === "always") base.interstitial = true;
  else if (body.interstitial === "never") base.interstitial = false;
  if (typeof body.redirectDelay === "number") {
    base.redirectDelay = Math.max(0, body.redirectDelay);
  }
  if (body.proxy === "always") base.proxy = true;
  else if (body.proxy === "never") base.proxy = false;
  if (body.multi) {
    base.multi = true;
    base.destinations = body.destinations ?? [];
  }
  if (typeof body.customJsFrontend === "string") {
    base.customJsFrontend = body.customJsFrontend || undefined;
  } else if (body.customJsFrontend === null) {
    base.customJsFrontend = undefined;
  }
  if (typeof body.customJsBackend === "string") {
    base.customJsBackend = body.customJsBackend || undefined;
  } else if (body.customJsBackend === null) {
    base.customJsBackend = undefined;
  }
  return base;
}

/** Upserts a LinkData into the links table + multi-destinations. */
async function saveLink(env: Env, id: string, data: LinkData): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO links (id, url, created_at, title, description, interstitial, redirect_delay, proxy, multi, custom_js_frontend, custom_js_backend)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       url = excluded.url,
       title = excluded.title,
       description = excluded.description,
       interstitial = excluded.interstitial,
       redirect_delay = excluded.redirect_delay,
       proxy = excluded.proxy,
       multi = excluded.multi,
       custom_js_frontend = excluded.custom_js_frontend,
       custom_js_backend = excluded.custom_js_backend`,
  )
    .bind(
      id,
      data.url,
      data.createdAt,
      data.title ?? null,
      data.description ?? null,
      data.interstitial !== undefined ? (data.interstitial ? 1 : 0) : null,
      data.redirectDelay ?? null,
      data.proxy !== undefined ? (data.proxy ? 1 : 0) : null,
      data.multi ? 1 : null,
      data.customJsFrontend ?? null,
      data.customJsBackend ?? null,
    )
    .run();
  if (data.multi && data.destinations) {
    await saveMultiDestinations(env, id, data.destinations);
  }
}

function linkToResponse(id: string, data: LinkData): Record<string, unknown> {
  const {
    url,
    createdAt,
    title,
    description,
    interstitial,
    redirectDelay,
    proxy,
    aliases,
    multi,
    destinations,
    customJsFrontend,
    customJsBackend,
  } = data;
  return {
    id,
    url,
    createdAt,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(interstitial !== undefined ? { interstitial } : {}),
    ...(redirectDelay !== undefined ? { redirectDelay } : {}),
    ...(proxy !== undefined ? { proxy } : {}),
    ...(aliases?.length ? { aliases } : {}),
    ...(multi ? { multi: true, destinations: destinations ?? [] } : {}),
    ...(customJsFrontend ? { customJsFrontend } : {}),
    ...(customJsBackend ? { customJsBackend } : {}),
  };
}

async function handleAPI(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const method = request.method;

  // Clean up expired sessions and OAuth state opportunistically
  env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(Date.now())
    .run();
  env.DB.prepare("DELETE FROM oauth_state WHERE expires_at <= ?")
    .bind(Date.now())
    .run();

  // GET /api/status
  if (pathname === "/api/status" && method === "GET") {
    const noTokenCheck = env.KRNLGO_NO_TOKEN !== undefined;
    const admin = await getAdmin(env);
    // Also check legacy KV if D1 has no admin yet
    const kvAdmin =
      !admin && env.LEGACY_KV
        ? (await env.LEGACY_KV.get("__admin__")) !== null
        : false;
    const passwordSet = !!(admin?.hash && admin.salt) || kvAdmin;
    const prismBound = !!admin?.sub;
    const prismConfig = await getPrismConfig(env);
    const setup = noTokenCheck || passwordSet || prismBound;
    return json({
      setup,
      noTokenCheck,
      kvPending: kvAdmin,
      backendJs: !!env.LOADER,
      prismEnabled: !!prismConfig,
      prismBound,
      passwordSet,
    });
  }

  // POST /api/setup — password-based setup (only when no admin exists yet)
  if (pathname === "/api/setup" && method === "POST") {
    const admin = await getAdmin(env);
    if (admin) return json({ error: "Already set up" }, 400);
    const { password } = (await request.json()) as { password: string };
    if (!password || password.length < 8)
      return json({ error: "Password must be at least 8 characters" }, 400);
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare("INSERT INTO admin (id, hash, salt) VALUES (1, ?, ?)")
      .bind(hash, salt)
      .run();
    return json({ ok: true });
  }

  // POST /api/auth — password login (disabled once Prism is bound)
  if (pathname === "/api/auth" && method === "POST") {
    let row = await env.DB.prepare(
      "SELECT hash, salt, sub FROM admin WHERE id = 1",
    ).first<AdminRow>();
    // Fall back to legacy KV credentials if D1 has no admin yet
    if (!row && env.LEGACY_KV) {
      const kvRaw = await env.LEGACY_KV.get("__admin__");
      if (kvRaw) {
        const kv = JSON.parse(kvRaw) as { hash: string; salt: string };
        row = { hash: kv.hash, salt: kv.salt, sub: null };
      }
    }
    if (!row || !row.hash || !row.salt)
      return json({ error: "Not configured" }, 400);
    if (row.sub)
      return json(
        { error: "Password login disabled — sign in with Prism" },
        400,
      );
    const { password } = (await request.json()) as { password: string };
    if (!(await verifyPassword(password, row.hash, row.salt)))
      return json({ error: "Invalid password" }, 401);
    // Auto-migrate admin credentials to D1 if they came from KV
    const d1Admin = await env.DB.prepare(
      "SELECT 1 FROM admin WHERE id = 1",
    ).first();
    if (!d1Admin) {
      await env.DB.prepare(
        "INSERT INTO admin (id, hash, salt) VALUES (1, ?, ?)",
      )
        .bind(row.hash, row.salt)
        .run();
    }
    const token = await mintSession(env);
    return json({ token });
  }

  // POST /api/auth/prism/start — begin OAuth flow
  // Body: { intent: 'login' | 'claim' | 'migrate' }
  if (pathname === "/api/auth/prism/start" && method === "POST") {
    const prism = await getPrismClient(env, request);
    if (!prism) return json({ error: "Prism not configured" }, 400);
    const { intent } = (await request.json().catch(() => ({}))) as {
      intent?: string;
    };
    if (intent !== "login" && intent !== "claim" && intent !== "migrate")
      return json({ error: "Invalid intent" }, 400);

    const admin = await getAdmin(env);
    if (intent === "claim" && admin)
      return json({ error: "Admin already exists" }, 400);
    if (intent === "login" && !admin?.sub)
      return json({ error: "Prism is not bound — use claim or migrate" }, 400);
    if (intent === "migrate") {
      if (!admin) return json({ error: "Nothing to migrate" }, 400);
      if (admin.sub) return json({ error: "Already migrated" }, 400);
      // Only the existing password admin may initiate migration
      if (!(await getAuth(request, env)))
        return json({ error: "Unauthorized" }, 401);
    }

    const { url, pkce } = await prism.createAuthorizationUrl();
    await env.DB.prepare(
      "INSERT INTO oauth_state (state, code_verifier, intent, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(pkce.state, pkce.codeVerifier, intent, Date.now() + 10 * 60 * 1000)
      .run();
    return json({ url });
  }

  // GET /api/prism/config — read current config (never returns secret)
  // Allowed without auth when no admin exists, so the init page can read it.
  if (pathname === "/api/prism/config" && method === "GET") {
    const admin = await getAdmin(env);
    if (admin && !(await getAuth(request, env)))
      return json({ error: "Unauthorized" }, 401);
    const config = await getPrismConfig(env);
    if (!config) return json({ configured: false });
    return json({
      configured: true,
      source: config.source,
      baseUrl: config.baseUrl,
      clientId: config.clientId,
    });
  }

  // PUT /api/prism/config — write to D1 (overrides env vars).
  // Allowed without auth only when no admin exists yet (init mode).
  if (pathname === "/api/prism/config" && method === "PUT") {
    const admin = await getAdmin(env);
    if (admin && !(await getAuth(request, env)))
      return json({ error: "Unauthorized" }, 401);
    const body = (await request.json().catch(() => ({}))) as {
      baseUrl?: string;
      clientId?: string;
      clientSecret?: string;
    };
    const baseUrl = body.baseUrl?.trim();
    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();
    if (!baseUrl || !clientId || !clientSecret)
      return json(
        { error: "baseUrl, clientId, and clientSecret are all required" },
        400,
      );
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:")
        return json({ error: "baseUrl must be http(s)" }, 400);
    } catch {
      return json({ error: "Invalid baseUrl" }, 400);
    }
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    await env.DB.prepare(
      `INSERT INTO prism_config (id, base_url, client_id, client_secret, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         base_url = excluded.base_url,
         client_id = excluded.client_id,
         client_secret = excluded.client_secret,
         updated_at = excluded.updated_at`,
    )
      .bind(normalizedBase, clientId, clientSecret, Date.now())
      .run();
    return json({ ok: true });
  }

  // DELETE /api/prism/config — clear DB config (auth required, blocked
  // when admin is currently bound to a Prism account to prevent lockout).
  if (pathname === "/api/prism/config" && method === "DELETE") {
    if (!(await getAuth(request, env)))
      return json({ error: "Unauthorized" }, 401);
    const admin = await getAdmin(env);
    if (admin?.sub)
      return json(
        {
          error:
            "Cannot clear Prism config while admin is bound to a Prism account",
        },
        400,
      );
    await env.DB.prepare("DELETE FROM prism_config WHERE id = 1").run();
    return json({ ok: true });
  }

  // GET /api/auth/prism/callback — finish OAuth flow
  if (pathname === "/api/auth/prism/callback" && method === "GET") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthErr = url.searchParams.get("error");
    if (oauthErr)
      return oauthError(url.searchParams.get("error_description") ?? oauthErr);
    if (!code || !state) return oauthError("Missing code or state.");

    const stateRow = await env.DB.prepare(
      "SELECT code_verifier, intent, expires_at FROM oauth_state WHERE state = ?",
    )
      .bind(state)
      .first<{ code_verifier: string; intent: string; expires_at: number }>();
    if (!stateRow) return oauthError("Unknown or expired state.");
    // One-time use
    await env.DB.prepare("DELETE FROM oauth_state WHERE state = ?")
      .bind(state)
      .run();
    if (stateRow.expires_at <= Date.now())
      return oauthError("OAuth state expired. Please try again.");

    const prism = await getPrismClient(env, request);
    if (!prism) return oauthError("Prism is not configured.");

    let sub: string;
    try {
      const tokens = await prism.exchangeCode(code, stateRow.code_verifier);
      const userInfo = await prism.getUserInfo(tokens.access_token);
      sub = userInfo.sub;
    } catch (e) {
      return oauthError(
        e instanceof Error ? e.message : "Token exchange failed.",
      );
    }
    if (!sub) return oauthError("Prism did not return a subject ID.");

    const admin = await getAdmin(env);
    if (stateRow.intent === "claim") {
      if (admin) return oauthError("An admin already exists.");
      await env.DB.prepare(
        "INSERT INTO admin (id, hash, salt, sub) VALUES (1, NULL, NULL, ?)",
      )
        .bind(sub)
        .run();
    } else if (stateRow.intent === "migrate") {
      if (!admin) return oauthError("No admin to migrate.");
      if (admin.sub) return oauthError("Already migrated.");
      // Bind the Prism subject and clear the password
      await env.DB.prepare(
        "UPDATE admin SET sub = ?, hash = NULL, salt = NULL WHERE id = 1",
      )
        .bind(sub)
        .run();
    } else {
      // login
      if (!admin?.sub) return oauthError("Prism is not bound on this site.");
      if (admin.sub !== sub)
        return oauthError("This Prism account is not the admin.");
    }

    const token = await mintSession(env);
    return sessionHandoff(token);
  }

  // POST /api/logout
  if (pathname === "/api/logout" && method === "POST") {
    const auth = request.headers.get("Authorization");
    if (auth?.startsWith("Bearer "))
      await env.DB.prepare("DELETE FROM sessions WHERE token = ?")
        .bind(auth.slice(7))
        .run();
    return json({ ok: true });
  }

  // GET /api/resolve/:id  (public — used by the interstitial / multi-select SPA page)
  const resolveMatch = pathname.match(/^\/api\/resolve\/([a-zA-Z0-9_-]+)$/);
  if (resolveMatch && method === "GET") {
    const resolved = await resolveToLink(env, resolveMatch[1]);
    if (!resolved) return json({ error: "Not found" }, 404);
    const config = await getConfig(env);
    if (resolved.data.multi && resolved.data.destinations?.length) {
      return json({
        multi: true,
        title: resolved.data.title ?? config.interstitialTitle,
        description:
          resolved.data.description ?? config.interstitialDescription,
        destinations: resolved.data.destinations,
        ...(resolved.data.customJsFrontend
          ? { customJs: resolved.data.customJsFrontend }
          : {}),
      });
    }
    return json({
      url: resolved.data.url,
      title: resolved.data.title ?? config.interstitialTitle,
      description: resolved.data.description ?? config.interstitialDescription,
      redirectDelay: resolved.data.redirectDelay ?? config.redirectDelay,
      ...(resolved.data.customJsFrontend
        ? { customJs: resolved.data.customJsFrontend }
        : {}),
    });
  }

  // All routes below require auth
  if (!(await getAuth(request, env)))
    return json({ error: "Unauthorized" }, 401);

  // POST /api/merge — consolidate duplicate links into aliases
  if (pathname === "/api/merge" && method === "POST") {
    let scopedIds: string[] | undefined;
    try {
      const body = (await request.json()) as { ids?: string[] };
      if (Array.isArray(body.ids)) scopedIds = body.ids;
    } catch {
      /* no body */
    }

    // Get all primary links (optionally scoped)
    let query = "SELECT id, url, created_at FROM links";
    const binds: string[] = [];
    if (scopedIds?.length) {
      const placeholders = scopedIds.map(() => "?").join(",");
      query += ` WHERE id IN (${placeholders})`;
      binds.push(...scopedIds);
    }
    const stmt = binds.length
      ? env.DB.prepare(query).bind(...binds)
      : env.DB.prepare(query);
    const { results: primaries } = await stmt.all<{
      id: string;
      url: string;
      created_at: number;
    }>();

    // Group by URL
    const byUrl = new Map<
      string,
      Array<{ id: string; url: string; created_at: number }>
    >();
    for (const p of primaries) {
      const group = byUrl.get(p.url) ?? [];
      group.push(p);
      byUrl.set(p.url, group);
    }

    let merged = 0;
    for (const group of byUrl.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.created_at - b.created_at);
      const primary = group[0];

      for (const dup of group.slice(1)) {
        // Re-point any aliases of the duplicate to the new primary
        await env.DB.prepare(
          "UPDATE aliases SET primary_id = ? WHERE primary_id = ?",
        )
          .bind(primary.id, dup.id)
          .run();
        // Convert the duplicate itself to an alias
        await env.DB.prepare(
          "INSERT INTO aliases (alias_id, primary_id) VALUES (?, ?) ON CONFLICT(alias_id) DO UPDATE SET primary_id = excluded.primary_id",
        )
          .bind(dup.id, primary.id)
          .run();
        // Delete the duplicate from links table
        await env.DB.prepare("DELETE FROM links WHERE id = ?")
          .bind(dup.id)
          .run();
        merged++;
      }
    }

    return json({ merged });
  }

  // POST /api/password — change admin password (disabled when Prism-bound)
  if (pathname === "/api/password" && method === "POST") {
    const row = await getAdmin(env);
    if (!row) return json({ error: "Not configured" }, 400);
    if (row.sub)
      return json({ error: "Password is disabled — managed by Prism" }, 400);
    if (!row.hash || !row.salt) return json({ error: "No password set" }, 400);
    const { currentPassword, newPassword } = (await request.json()) as {
      currentPassword: string;
      newPassword: string;
    };
    if (!(await verifyPassword(currentPassword, row.hash, row.salt)))
      return json({ error: "Current password is incorrect" }, 401);
    if (!newPassword || newPassword.length < 8)
      return json({ error: "New password must be at least 8 characters" }, 400);
    const { hash: newHash, salt: newSalt } = await hashPassword(newPassword);
    await env.DB.prepare("UPDATE admin SET hash = ?, salt = ? WHERE id = 1")
      .bind(newHash, newSalt)
      .run();
    return json({ ok: true });
  }

  // GET /api/config
  if (pathname === "/api/config" && method === "GET") {
    return json(await getConfig(env));
  }

  // PUT /api/config
  if (pathname === "/api/config" && method === "PUT") {
    const body = (await request.json()) as Partial<GlobalConfig>;
    const updated = { ...(await getConfig(env)), ...body };
    await env.DB.prepare(
      `INSERT INTO config (id, default_interstitial, interstitial_title, interstitial_description, redirect_delay, default_proxy)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         default_interstitial = excluded.default_interstitial,
         interstitial_title = excluded.interstitial_title,
         interstitial_description = excluded.interstitial_description,
         redirect_delay = excluded.redirect_delay,
         default_proxy = excluded.default_proxy`,
    )
      .bind(
        updated.defaultInterstitial ? 1 : 0,
        updated.interstitialTitle,
        updated.interstitialDescription,
        updated.redirectDelay,
        updated.defaultProxy ? 1 : 0,
      )
      .run();
    return json(updated);
  }

  // GET /api/links
  if (pathname === "/api/links" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM links").all<{
      id: string;
      url: string;
      created_at: number;
      title: string | null;
      description: string | null;
      interstitial: number | null;
      redirect_delay: number | null;
      proxy: number | null;
      multi: number | null;
      custom_js_frontend: string | null;
      custom_js_backend: string | null;
    }>();
    const links = await Promise.all(
      results.map(async (row) => {
        const aliases = await getAliases(env, row.id);
        const isMulti = row.multi === 1;
        const destinations = isMulti
          ? await getMultiDestinations(env, row.id)
          : [];
        const data: LinkData = {
          url: row.url,
          createdAt: row.created_at,
          ...(row.title ? { title: row.title } : {}),
          ...(row.description ? { description: row.description } : {}),
          ...(row.interstitial !== null
            ? { interstitial: row.interstitial === 1 }
            : {}),
          ...(row.redirect_delay !== null
            ? { redirectDelay: row.redirect_delay }
            : {}),
          ...(row.proxy !== null ? { proxy: row.proxy === 1 } : {}),
          ...(aliases.length ? { aliases } : {}),
          ...(isMulti ? { multi: true, destinations } : {}),
          ...(row.custom_js_frontend
            ? { customJsFrontend: row.custom_js_frontend }
            : {}),
          ...(row.custom_js_backend
            ? { customJsBackend: row.custom_js_backend }
            : {}),
        };
        return linkToResponse(row.id, data);
      }),
    );
    return json(links);
  }

  // POST /api/links
  if (pathname === "/api/links" && method === "POST") {
    const body = (await request.json()) as LinkPayload;
    if (!body.url) return json({ error: "URL required" }, 400);
    try {
      new URL(body.url);
    } catch {
      return json({ error: "Invalid URL" }, 400);
    }
    const id = body.id?.trim() || generateId();
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id))
      return json(
        { error: "ID must be 1-50 chars: a-z, A-Z, 0-9, _ or -" },
        400,
      );

    // Check if ID exists as a link or alias
    const existingLink = await env.DB.prepare(
      "SELECT 1 FROM links WHERE id = ?",
    )
      .bind(id)
      .first();
    const existingAlias = await env.DB.prepare(
      "SELECT 1 FROM aliases WHERE alias_id = ?",
    )
      .bind(id)
      .first();
    if (existingLink || existingAlias)
      return json({ error: "ID already exists" }, 409);

    // Auto-merge: if the URL already exists, create an alias instead
    const existing = await findLinkByUrl(env, body.url);
    if (existing) {
      await env.DB.prepare(
        "INSERT INTO aliases (alias_id, primary_id) VALUES (?, ?)",
      )
        .bind(id, existing.id)
        .run();
      const updatedData = await getLink(env, existing.id);
      if (!updatedData) return json({ error: "Internal error" }, 500);
      return json(
        {
          ...linkToResponse(existing.id, updatedData),
          merged: true,
          aliasId: id,
        },
        201,
      );
    }

    const link = applyLinkPayload({}, body);
    await saveLink(env, id, link);
    return json({ id, ...link }, 201);
  }

  // /api/links/:id/aliases routes
  const aliasesMatch = pathname.match(
    /^\/api\/links\/([a-zA-Z0-9_-]+)\/aliases(?:\/([a-zA-Z0-9_-]+))?$/,
  );
  if (aliasesMatch) {
    const primaryId = aliasesMatch[1];
    const aliasId = aliasesMatch[2];

    // POST /api/links/:id/aliases — add a manual alias
    if (!aliasId && method === "POST") {
      const primary = await getLink(env, primaryId);
      if (!primary) return json({ error: "Not found" }, 404);
      const { alias } = (await request.json()) as { alias: string };
      const cleanAlias = alias?.trim();
      if (!cleanAlias || !/^[a-zA-Z0-9_-]{1,50}$/.test(cleanAlias))
        return json(
          { error: "Alias ID must be 1-50 chars: a-z, A-Z, 0-9, _ or -" },
          400,
        );
      // Check if ID exists
      const existingLink = await env.DB.prepare(
        "SELECT 1 FROM links WHERE id = ?",
      )
        .bind(cleanAlias)
        .first();
      const existingAlias = await env.DB.prepare(
        "SELECT 1 FROM aliases WHERE alias_id = ?",
      )
        .bind(cleanAlias)
        .first();
      if (existingLink || existingAlias)
        return json({ error: "ID already exists" }, 409);
      await env.DB.prepare(
        "INSERT INTO aliases (alias_id, primary_id) VALUES (?, ?)",
      )
        .bind(cleanAlias, primaryId)
        .run();
      const updated = await getLink(env, primaryId);
      if (!updated) return json({ error: "Internal error" }, 500);
      return json(linkToResponse(primaryId, updated));
    }

    // DELETE /api/links/:id/aliases/:aliasId — remove an alias
    if (aliasId && method === "DELETE") {
      const primary = await getLink(env, primaryId);
      if (!primary) return json({ error: "Not found" }, 404);
      await env.DB.prepare("DELETE FROM aliases WHERE alias_id = ?")
        .bind(aliasId)
        .run();
      const updated = await getLink(env, primaryId);
      if (!updated) return json({ error: "Internal error" }, 500);
      return json(linkToResponse(primaryId, updated));
    }
  }

  // /api/links/:id routes
  const linkMatch = pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)$/);
  if (linkMatch) {
    const id = linkMatch[1];

    if (method === "GET") {
      const resolved = await resolveToLink(env, id);
      if (!resolved) return json({ error: "Not found" }, 404);
      return json(linkToResponse(resolved.id, resolved.data));
    }

    if (method === "PUT") {
      const resolved = await resolveToLink(env, id);
      if (!resolved) return json({ error: "Not found" }, 404);
      const body = (await request.json()) as LinkPayload;
      if (!body.url) return json({ error: "URL required" }, 400);
      try {
        new URL(body.url);
      } catch {
        return json({ error: "Invalid URL" }, 400);
      }
      const updated = applyLinkPayload(resolved.data, body);
      await saveLink(env, resolved.id, updated);
      const full = await getLink(env, resolved.id);
      if (!full) return json({ error: "Internal error" }, 500);
      return json(linkToResponse(resolved.id, full));
    }

    if (method === "DELETE") {
      // Check if it's an alias
      const alias = await env.DB.prepare(
        "SELECT primary_id FROM aliases WHERE alias_id = ?",
      )
        .bind(id)
        .first<{ primary_id: string }>();

      if (alias) {
        // Just remove the alias
        await env.DB.prepare("DELETE FROM aliases WHERE alias_id = ?")
          .bind(id)
          .run();
      } else {
        // It's a primary link — delete all its aliases, then the link itself
        await env.DB.prepare("DELETE FROM aliases WHERE primary_id = ?")
          .bind(id)
          .run();
        await env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();
      }
      return json({ ok: true });
    }
  }

  // POST /api/migrate-kv — one-time migration from KV to D1
  if (pathname === "/api/migrate-kv" && method === "POST") {
    if (!env.LEGACY_KV)
      return json(
        {
          error:
            "LEGACY_KV binding not configured. Add it to wrangler.jsonc to migrate.",
        },
        400,
      );

    const stats = { links: 0, aliases: 0, admin: false, config: false };

    // Migrate admin
    const adminRaw = await env.LEGACY_KV.get("__admin__");
    if (adminRaw) {
      const { hash, salt } = JSON.parse(adminRaw) as {
        hash: string;
        salt: string;
      };
      await env.DB.prepare(
        "INSERT INTO admin (id, hash, salt) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, salt = excluded.salt",
      )
        .bind(hash, salt)
        .run();
      stats.admin = true;
    }

    // Migrate config
    const configRaw = await env.LEGACY_KV.get("__config__");
    if (configRaw) {
      const cfg = {
        ...DEFAULT_CONFIG,
        ...JSON.parse(configRaw),
      } as GlobalConfig;
      await env.DB.prepare(
        `INSERT INTO config (id, default_interstitial, interstitial_title, interstitial_description, redirect_delay)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           default_interstitial = excluded.default_interstitial,
           interstitial_title = excluded.interstitial_title,
           interstitial_description = excluded.interstitial_description,
           redirect_delay = excluded.redirect_delay`,
      )
        .bind(
          cfg.defaultInterstitial ? 1 : 0,
          cfg.interstitialTitle,
          cfg.interstitialDescription,
          cfg.redirectDelay,
        )
        .run();
      stats.config = true;
    }

    // Migrate links and aliases
    interface KvLinkData {
      url: string;
      createdAt: number;
      title?: string;
      description?: string;
      interstitial?: boolean;
      redirectDelay?: number;
      aliases?: string[];
    }
    interface KvAliasData {
      aliasOf: string;
    }
    function isKvAlias(d: unknown): d is KvAliasData {
      return typeof d === "object" && d !== null && "aliasOf" in d;
    }

    const list = await env.LEGACY_KV.list({ prefix: "link:" });
    // First pass: insert primary links
    for (const key of list.keys) {
      const raw = await env.LEGACY_KV.get(key.name);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as KvLinkData | KvAliasData;
      if (isKvAlias(parsed)) continue;
      const id = key.name.slice(5);
      await env.DB.prepare(
        `INSERT INTO links (id, url, created_at, title, description, interstitial, redirect_delay)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           url = excluded.url,
           title = excluded.title,
           description = excluded.description,
           interstitial = excluded.interstitial,
           redirect_delay = excluded.redirect_delay`,
      )
        .bind(
          id,
          parsed.url,
          parsed.createdAt,
          parsed.title ?? null,
          parsed.description ?? null,
          parsed.interstitial !== undefined
            ? parsed.interstitial
              ? 1
              : 0
            : null,
          parsed.redirectDelay ?? null,
        )
        .run();
      stats.links++;
    }
    // Second pass: insert aliases
    for (const key of list.keys) {
      const raw = await env.LEGACY_KV.get(key.name);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as KvLinkData | KvAliasData;
      if (!isKvAlias(parsed)) continue;
      const aliasId = key.name.slice(5);
      await env.DB.prepare(
        "INSERT INTO aliases (alias_id, primary_id) VALUES (?, ?) ON CONFLICT(alias_id) DO UPDATE SET primary_id = excluded.primary_id",
      )
        .bind(aliasId, parsed.aliasOf)
        .run();
      stats.aliases++;
    }

    return json({ ok: true, migrated: stats });
  }

  return json({ error: "Not found" }, 404);
}

async function handleProxy(
  targetUrl: string,
  originalRequest: Request,
): Promise<Response> {
  const url = new URL(targetUrl);
  const headers = new Headers();
  for (const h of [
    "accept",
    "accept-encoding",
    "accept-language",
    "cache-control",
    "if-none-match",
    "if-modified-since",
    "range",
    "user-agent",
  ]) {
    const val = originalRequest.headers.get(h);
    if (val) headers.set(h, val);
  }
  headers.set("host", url.host);

  try {
    const upstream = await fetch(
      new Request(url.toString(), {
        method: "GET",
        headers,
        redirect: "follow",
      }),
    );
    const respHeaders = new Headers(upstream.headers);
    for (const h of ["transfer-encoding", "connection", "keep-alive"]) {
      respHeaders.delete(h);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch {
    return Response.redirect(targetUrl, 302);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/api/")) return handleAPI(request, env, pathname);

    // Short link: single path segment, alphanumeric + _ -
    if (pathname !== "/" && /^\/[a-zA-Z0-9_-]+$/.test(pathname)) {
      const id = pathname.slice(1);
      const resolved = await resolveToLink(env, id);
      if (resolved) {
        // Execute custom JS on the backend via Dynamic Workers
        if (resolved.data.customJsBackend && env.LOADER) {
          try {
            const linkDataJson = JSON.stringify(resolved.data);
            const code = `export default { async fetch(request, env) { const linkData = JSON.parse(${JSON.stringify(linkDataJson)}); ${resolved.data.customJsBackend}; return new Response("ok"); } }`;
            const stub = env.LOADER.get(null, () => ({
              compatibilityDate: "2025-09-27",
              mainModule: "index.js",
              modules: { "index.js": code },
              env: { DB: env.DB },
            }));
            stub
              .getEntrypoint()
              .fetch(request.clone() as RequestInfo)
              .catch((e: unknown) =>
                console.error("Custom backend JS error:", e),
              );
          } catch (e) {
            console.error("Custom backend JS load error:", e);
          }
        }
        // Multi-select links always serve the SPA selection page
        if (resolved.data.multi) {
          return serveIndex(request, env);
        }
        const config = await getConfig(env);
        const useProxy = resolved.data.proxy ?? config.defaultProxy;
        if (useProxy) {
          return handleProxy(resolved.data.url, request);
        }
        const showInterstitial =
          resolved.data.interstitial ?? config.defaultInterstitial;
        if (!showInterstitial) {
          return Response.redirect(resolved.data.url, 302);
        }
        return serveIndex(request, env);
      }
      // Not found → serve SPA (shows creation form)
      return serveIndex(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
