/// <reference path="../worker-configuration.d.ts" />

interface LinkData {
  url: string;
  createdAt: number;
  title?: string;
  description?: string;
  interstitial?: boolean; // undefined = use global default
  redirectDelay?: number; // seconds; undefined = use global default, 0 = disabled
  aliases?: string[]; // other IDs that redirect here
}

interface GlobalConfig {
  defaultInterstitial: boolean;
  interstitialTitle: string;
  interstitialDescription: string;
  redirectDelay: number; // seconds; 0 = no auto-redirect
}

const DEFAULT_CONFIG: GlobalConfig = {
  defaultInterstitial: false,
  interstitialTitle: "You are being redirected",
  interstitialDescription: "You are about to visit an external website.",
  redirectDelay: 0,
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
  }>();
  if (!row) return DEFAULT_CONFIG;
  return {
    defaultInterstitial: row.default_interstitial === 1,
    interstitialTitle: row.interstitial_title,
    interstitialDescription: row.interstitial_description,
    redirectDelay: row.redirect_delay,
  };
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

/** Loads a LinkData object from the links table + its aliases. */
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
    }>();
  if (!row) return null;
  const aliases = await getAliases(env, id);
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
    ...(aliases.length ? { aliases } : {}),
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

type InterstitialMode = "default" | "always" | "never";

interface LinkPayload {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  interstitial?: InterstitialMode;
  redirectDelay?: number | null;
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
  return base;
}

/** Upserts a LinkData into the links table. */
async function saveLink(env: Env, id: string, data: LinkData): Promise<void> {
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
      data.url,
      data.createdAt,
      data.title ?? null,
      data.description ?? null,
      data.interstitial !== undefined ? (data.interstitial ? 1 : 0) : null,
      data.redirectDelay ?? null,
    )
    .run();
}

function linkToResponse(id: string, data: LinkData): Record<string, unknown> {
  const {
    url,
    createdAt,
    title,
    description,
    interstitial,
    redirectDelay,
    aliases,
  } = data;
  return {
    id,
    url,
    createdAt,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(interstitial !== undefined ? { interstitial } : {}),
    ...(redirectDelay !== undefined ? { redirectDelay } : {}),
    ...(aliases?.length ? { aliases } : {}),
  };
}

async function handleAPI(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const method = request.method;

  // Clean up expired sessions opportunistically
  env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(Date.now())
    .run();

  // GET /api/status
  if (pathname === "/api/status" && method === "GET") {
    const noTokenCheck = env.KRNLGO_NO_TOKEN !== undefined;
    const admin = await env.DB.prepare(
      "SELECT 1 FROM admin WHERE id = 1",
    ).first();
    // Also check legacy KV if D1 has no admin yet
    const kvAdmin =
      !admin && env.LEGACY_KV
        ? (await env.LEGACY_KV.get("__admin__")) !== null
        : false;
    const setup = noTokenCheck || admin !== null || kvAdmin;
    return json({ setup, noTokenCheck, kvPending: kvAdmin });
  }

  // POST /api/setup
  if (pathname === "/api/setup" && method === "POST") {
    const existing = await env.DB.prepare(
      "SELECT 1 FROM admin WHERE id = 1",
    ).first();
    if (existing) return json({ error: "Already set up" }, 400);
    const { password } = (await request.json()) as { password: string };
    if (!password || password.length < 8)
      return json({ error: "Password must be at least 8 characters" }, 400);
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare("INSERT INTO admin (id, hash, salt) VALUES (1, ?, ?)")
      .bind(hash, salt)
      .run();
    return json({ ok: true });
  }

  // POST /api/auth
  if (pathname === "/api/auth" && method === "POST") {
    let row = await env.DB.prepare(
      "SELECT hash, salt FROM admin WHERE id = 1",
    ).first<{ hash: string; salt: string }>();
    // Fall back to legacy KV credentials if D1 has no admin yet
    if (!row && env.LEGACY_KV) {
      const kvRaw = await env.LEGACY_KV.get("__admin__");
      if (kvRaw) row = JSON.parse(kvRaw) as { hash: string; salt: string };
    }
    if (!row) return json({ error: "Not configured" }, 400);
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
    const token = generateToken();
    await env.DB.prepare(
      "INSERT INTO sessions (token, expires_at) VALUES (?, ?)",
    )
      .bind(token, Date.now() + 86400 * 1000)
      .run();
    return json({ token });
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

  // GET /api/resolve/:id  (public — used by the interstitial SPA page)
  const resolveMatch = pathname.match(/^\/api\/resolve\/([a-zA-Z0-9_-]+)$/);
  if (resolveMatch && method === "GET") {
    const resolved = await resolveToLink(env, resolveMatch[1]);
    if (!resolved) return json({ error: "Not found" }, 404);
    const config = await getConfig(env);
    return json({
      url: resolved.data.url,
      title: resolved.data.title ?? config.interstitialTitle,
      description: resolved.data.description ?? config.interstitialDescription,
      redirectDelay: resolved.data.redirectDelay ?? config.redirectDelay,
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

  // POST /api/password — change admin password
  if (pathname === "/api/password" && method === "POST") {
    const row = await env.DB.prepare(
      "SELECT hash, salt FROM admin WHERE id = 1",
    ).first<{ hash: string; salt: string }>();
    if (!row) return json({ error: "Not configured" }, 400);
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
      `INSERT INTO config (id, default_interstitial, interstitial_title, interstitial_description, redirect_delay)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         default_interstitial = excluded.default_interstitial,
         interstitial_title = excluded.interstitial_title,
         interstitial_description = excluded.interstitial_description,
         redirect_delay = excluded.redirect_delay`,
    )
      .bind(
        updated.defaultInterstitial ? 1 : 0,
        updated.interstitialTitle,
        updated.interstitialDescription,
        updated.redirectDelay,
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
    }>();
    const links = await Promise.all(
      results.map(async (row) => {
        const aliases = await getAliases(env, row.id);
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
          ...(aliases.length ? { aliases } : {}),
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/api/")) return handleAPI(request, env, pathname);

    // Short link: single path segment, alphanumeric + _ -
    if (pathname !== "/" && /^\/[a-zA-Z0-9_-]+$/.test(pathname)) {
      const id = pathname.slice(1);
      const resolved = await resolveToLink(env, id);
      if (resolved) {
        const config = await getConfig(env);
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
