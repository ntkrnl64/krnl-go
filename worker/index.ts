/// <reference path="../worker-configuration.d.ts" />

interface LinkData {
  url: string;
  createdAt: number;
  title?: string;
  description?: string;
  interstitial?: boolean; // undefined = use global default
  redirectDelay?: number; // seconds; undefined = use global default, 0 = disabled
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

type InterstitialMode = "default" | "always" | "never";

interface LinkPayload {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  interstitial?: InterstitialMode;
  redirectDelay?: number | null; // number = per-link override, null = reset to global
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
  // 'default' or absent → interstitial field omitted (use global)
  if (typeof body.redirectDelay === "number") {
    base.redirectDelay = Math.max(0, body.redirectDelay);
  }
  // null or absent → redirectDelay field omitted (resolve falls back to global)
  return base;
}

async function handleAPI(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const method = request.method;

  // GET /api/status
  if (pathname === "/api/status" && method === "GET") {
    return json({ setup: (await env.LINKS.get("__admin__")) !== null });
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
    const raw = await env.LINKS.get(`link:${resolveMatch[1]}`);
    if (!raw) return json({ error: "Not found" }, 404);
    const link = JSON.parse(raw) as LinkData;
    const config = await getConfig(env);
    return json({
      url: link.url,
      title: link.title ?? config.interstitialTitle,
      description: link.description ?? config.interstitialDescription,
      redirectDelay: link.redirectDelay ?? config.redirectDelay,
    });
  }

  // All routes below require auth
  if (!(await getAuth(request, env)))
    return json({ error: "Unauthorized" }, 401);

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
    const links = await Promise.all(
      list.keys.map(async (key) => {
        const raw = await env.LINKS.get(key.name);
        const {
          url,
          createdAt,
          title,
          description,
          interstitial,
          redirectDelay,
        } = (raw ? JSON.parse(raw) : {}) as LinkData;
        return {
          id: key.name.slice(5),
          url,
          createdAt,
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(interstitial !== undefined ? { interstitial } : {}),
          ...(redirectDelay !== undefined ? { redirectDelay } : {}),
        };
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
    if (await env.LINKS.get(`link:${id}`))
      return json({ error: "ID already exists" }, 409);
    const link = applyLinkPayload({}, body);
    await env.LINKS.put(`link:${id}`, JSON.stringify(link));
    return json({ id, ...link }, 201);
  }

  // /api/links/:id routes
  const linkMatch = pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)$/);
  if (linkMatch) {
    const id = linkMatch[1];

    if (method === "GET") {
      const raw = await env.LINKS.get(`link:${id}`);
      if (!raw) return json({ error: "Not found" }, 404);
      const {
        url,
        createdAt,
        title,
        description,
        interstitial,
        redirectDelay,
      } = JSON.parse(raw) as LinkData;
      return json({
        id,
        url,
        createdAt,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(interstitial !== undefined ? { interstitial } : {}),
        ...(redirectDelay !== undefined ? { redirectDelay } : {}),
      });
    }

    if (method === "PUT") {
      const raw = await env.LINKS.get(`link:${id}`);
      if (!raw) return json({ error: "Not found" }, 404);
      const body = (await request.json()) as LinkPayload;
      if (!body.url) return json({ error: "URL required" }, 400);
      try {
        new URL(body.url);
      } catch {
        return json({ error: "Invalid URL" }, 400);
      }
      const existing = JSON.parse(raw) as LinkData;
      const updated = applyLinkPayload(existing, body);
      await env.LINKS.put(`link:${id}`, JSON.stringify(updated));
      return json({ id, ...updated });
    }

    if (method === "DELETE") {
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
      const raw = await env.LINKS.get(`link:${id}`);
      if (raw) {
        const link = JSON.parse(raw) as LinkData;
        const config = await getConfig(env);
        const showInterstitial =
          link.interstitial ?? config.defaultInterstitial;
        if (!showInterstitial) {
          return Response.redirect(link.url, 302);
        }
        // Interstitial enabled → serve SPA, which will call /api/resolve/:id
        return serveIndex(request, env);
      }
      // Not found → serve SPA (shows creation form)
      return serveIndex(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
