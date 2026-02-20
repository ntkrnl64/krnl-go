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

interface AliasData {
  aliasOf: string; // primary link ID
}

interface AdminData {
  hash: string;
  salt: string;
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

function isAlias(data: unknown): data is AliasData {
  return typeof data === "object" && data !== null && "aliasOf" in data;
}

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
  return (await env.LINKS.get(`__session__:${auth.slice(7)}`)) !== null;
}

async function serveIndex(request: Request, env: Env): Promise<Response> {
  return env.ASSETS.fetch(
    new Request(new URL("/index.html", request.url).toString()),
  );
}

async function getConfig(env: Env): Promise<GlobalConfig> {
  const raw = await env.LINKS.get("__config__");
  if (!raw) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<GlobalConfig>) };
}

/** Resolves an ID to its primary link data, following aliases one level. */
async function resolveToLink(
  env: Env,
  id: string,
): Promise<{ id: string; data: LinkData } | null> {
  const raw = await env.LINKS.get(`link:${id}`);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as LinkData | AliasData;
  if (isAlias(parsed)) {
    const primaryRaw = await env.LINKS.get(`link:${parsed.aliasOf}`);
    if (!primaryRaw) return null;
    return { id: parsed.aliasOf, data: JSON.parse(primaryRaw) as LinkData };
  }
  return { id, data: parsed };
}

/** Scans all primary links to find one matching a URL (used for auto-merge). */
async function findLinkByUrl(
  env: Env,
  url: string,
): Promise<{ id: string; data: LinkData } | null> {
  const list = await env.LINKS.list({ prefix: "link:" });
  for (const key of list.keys) {
    const raw = await env.LINKS.get(key.name);
    if (!raw) continue;
    const parsed = JSON.parse(raw) as LinkData | AliasData;
    if (!isAlias(parsed) && parsed.url === url) {
      return { id: key.name.slice(5), data: parsed };
    }
  }
  return null;
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

  // GET /api/status
  if (pathname === "/api/status" && method === "GET") {
    const noTokenCheck = env.KRNLGO_NO_TOKEN !== undefined;
    const setup = noTokenCheck || (await env.LINKS.get("__admin__")) !== null;
    return json({ setup, noTokenCheck });
  }

  // POST /api/setup
  if (pathname === "/api/setup" && method === "POST") {
    if (await env.LINKS.get("__admin__"))
      return json({ error: "Already set up" }, 400);
    const { password } = (await request.json()) as { password: string };
    if (!password || password.length < 8)
      return json({ error: "Password must be at least 8 characters" }, 400);
    const { hash, salt } = await hashPassword(password);
    await env.LINKS.put(
      "__admin__",
      JSON.stringify({ hash, salt } satisfies AdminData),
    );
    return json({ ok: true });
  }

  // POST /api/auth
  if (pathname === "/api/auth" && method === "POST") {
    const raw = await env.LINKS.get("__admin__");
    if (!raw) return json({ error: "Not configured" }, 400);
    const { password } = (await request.json()) as { password: string };
    const { hash, salt } = JSON.parse(raw) as AdminData;
    if (!(await verifyPassword(password, hash, salt)))
      return json({ error: "Invalid password" }, 401);
    const token = generateToken();
    await env.LINKS.put(`__session__:${token}`, "1", { expirationTtl: 86400 });
    return json({ token });
  }

  // POST /api/logout
  if (pathname === "/api/logout" && method === "POST") {
    const auth = request.headers.get("Authorization");
    if (auth?.startsWith("Bearer "))
      await env.LINKS.delete(`__session__:${auth.slice(7)}`);
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
  // Body: { ids?: string[] }  — if ids provided, only consider those primary links
  if (pathname === "/api/merge" && method === "POST") {
    let scopedIds: string[] | undefined;
    try {
      const body = (await request.json()) as { ids?: string[] };
      if (Array.isArray(body.ids)) scopedIds = body.ids;
    } catch {
      /* no body */
    }

    const list = await env.LINKS.list({ prefix: "link:" });

    // Gather primary links, optionally scoped to the provided IDs
    const primaries: Array<{ id: string; data: LinkData }> = [];
    for (const key of list.keys) {
      const id = key.name.slice(5);
      if (scopedIds && !scopedIds.includes(id)) continue;
      const raw = await env.LINKS.get(key.name);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as LinkData | AliasData;
      if (!isAlias(parsed)) primaries.push({ id, data: parsed });
    }

    // Group by URL
    const byUrl = new Map<string, Array<{ id: string; data: LinkData }>>();
    for (const p of primaries) {
      const group = byUrl.get(p.data.url) ?? [];
      group.push(p);
      byUrl.set(p.data.url, group);
    }

    let merged = 0;
    for (const group of byUrl.values()) {
      if (group.length < 2) continue;
      // Oldest entry becomes (or stays) the primary
      group.sort((a, b) => a.data.createdAt - b.data.createdAt);
      const primary = group[0];
      const newAliases = [...(primary.data.aliases ?? [])];

      for (const dup of group.slice(1)) {
        const dupAliases = dup.data.aliases ?? [];
        // Convert the duplicate itself to an alias entry
        await env.LINKS.put(
          `link:${dup.id}`,
          JSON.stringify({ aliasOf: primary.id } satisfies AliasData),
        );
        // Re-point any of the duplicate's own aliases to the new primary
        for (const aliasId of dupAliases) {
          await env.LINKS.put(
            `link:${aliasId}`,
            JSON.stringify({ aliasOf: primary.id } satisfies AliasData),
          );
        }
        newAliases.push(dup.id, ...dupAliases);
        merged++;
      }

      const updatedPrimary: LinkData = { ...primary.data, aliases: newAliases };
      await env.LINKS.put(`link:${primary.id}`, JSON.stringify(updatedPrimary));
    }

    return json({ merged });
  }

  // POST /api/password — change admin password
  if (pathname === "/api/password" && method === "POST") {
    const raw = await env.LINKS.get("__admin__");
    if (!raw) return json({ error: "Not configured" }, 400);
    const { currentPassword, newPassword } = (await request.json()) as {
      currentPassword: string;
      newPassword: string;
    };
    const { hash, salt } = JSON.parse(raw) as AdminData;
    if (!(await verifyPassword(currentPassword, hash, salt)))
      return json({ error: "Current password is incorrect" }, 401);
    if (!newPassword || newPassword.length < 8)
      return json({ error: "New password must be at least 8 characters" }, 400);
    const { hash: newHash, salt: newSalt } = await hashPassword(newPassword);
    await env.LINKS.put(
      "__admin__",
      JSON.stringify({ hash: newHash, salt: newSalt } satisfies AdminData),
    );
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
    await env.LINKS.put("__config__", JSON.stringify(updated));
    return json(updated);
  }

  // GET /api/links
  if (pathname === "/api/links" && method === "GET") {
    const list = await env.LINKS.list({ prefix: "link:" });
    const links = (
      await Promise.all(
        list.keys.map(async (key) => {
          const raw = await env.LINKS.get(key.name);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as LinkData | AliasData;
          if (isAlias(parsed)) return null; // skip alias entries
          return linkToResponse(key.name.slice(5), parsed);
        }),
      )
    ).filter(Boolean);
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
    if (await env.LINKS.get(`link:${id}`))
      return json({ error: "ID already exists" }, 409);

    // Auto-merge: if the URL already exists, create an alias instead
    const existing = await findLinkByUrl(env, body.url);
    if (existing) {
      await env.LINKS.put(
        `link:${id}`,
        JSON.stringify({ aliasOf: existing.id } satisfies AliasData),
      );
      const updatedData: LinkData = {
        ...existing.data,
        aliases: [...(existing.data.aliases ?? []), id],
      };
      await env.LINKS.put(`link:${existing.id}`, JSON.stringify(updatedData));
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
    await env.LINKS.put(`link:${id}`, JSON.stringify(link));
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
      const primaryRaw = await env.LINKS.get(`link:${primaryId}`);
      if (!primaryRaw) return json({ error: "Not found" }, 404);
      const primary = JSON.parse(primaryRaw) as LinkData | AliasData;
      if (isAlias(primary))
        return json({ error: "Cannot add alias to an alias" }, 400);
      const { alias } = (await request.json()) as { alias: string };
      const cleanAlias = alias?.trim();
      if (!cleanAlias || !/^[a-zA-Z0-9_-]{1,50}$/.test(cleanAlias))
        return json(
          { error: "Alias ID must be 1-50 chars: a-z, A-Z, 0-9, _ or -" },
          400,
        );
      if (await env.LINKS.get(`link:${cleanAlias}`))
        return json({ error: "ID already exists" }, 409);
      await env.LINKS.put(
        `link:${cleanAlias}`,
        JSON.stringify({ aliasOf: primaryId } satisfies AliasData),
      );
      const updated: LinkData = {
        ...primary,
        aliases: [...(primary.aliases ?? []), cleanAlias],
      };
      await env.LINKS.put(`link:${primaryId}`, JSON.stringify(updated));
      return json(linkToResponse(primaryId, updated));
    }

    // DELETE /api/links/:id/aliases/:aliasId — remove an alias
    if (aliasId && method === "DELETE") {
      const primaryRaw = await env.LINKS.get(`link:${primaryId}`);
      if (!primaryRaw) return json({ error: "Not found" }, 404);
      const primary = JSON.parse(primaryRaw) as LinkData;
      await env.LINKS.delete(`link:${aliasId}`);
      const updated: LinkData = {
        ...primary,
        aliases: (primary.aliases ?? []).filter((a) => a !== aliasId),
      };
      await env.LINKS.put(`link:${primaryId}`, JSON.stringify(updated));
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
      if (resolved.data.aliases?.length)
        updated.aliases = resolved.data.aliases;
      await env.LINKS.put(`link:${resolved.id}`, JSON.stringify(updated));
      return json(linkToResponse(resolved.id, updated));
    }

    if (method === "DELETE") {
      const raw = await env.LINKS.get(`link:${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as LinkData | AliasData;
        if (isAlias(parsed)) {
          // Remove this alias from the primary's list
          const primaryRaw = await env.LINKS.get(`link:${parsed.aliasOf}`);
          if (primaryRaw) {
            const primary = JSON.parse(primaryRaw) as LinkData;
            const updated: LinkData = {
              ...primary,
              aliases: (primary.aliases ?? []).filter((a) => a !== id),
            };
            await env.LINKS.put(
              `link:${parsed.aliasOf}`,
              JSON.stringify(updated),
            );
          }
        } else {
          // Delete all alias entries pointing to this primary
          await Promise.all(
            (parsed.aliases ?? []).map((alias) =>
              env.LINKS.delete(`link:${alias}`),
            ),
          );
        }
      }
      await env.LINKS.delete(`link:${id}`);
      return json({ ok: true });
    }
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
