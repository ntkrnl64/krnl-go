const TOKEN_KEY = "krnl_go_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function checkStatus(): Promise<{ setup: boolean }> {
  const res = await fetch("/api/status");
  return res.json() as Promise<{ setup: boolean }>;
}

export async function setup(password: string): Promise<void> {
  const res = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
}

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  setToken(data.token!);
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST", headers: authHeaders() });
  clearToken();
}

export interface ShortLink {
  id: string;
  url: string;
  createdAt: number;
  title?: string;
  description?: string;
  interstitial?: boolean;
  redirectDelay?: number;
}

export interface ResolvedLink {
  url: string;
  title: string;
  description: string;
  redirectDelay: number;
}

export interface GlobalConfig {
  defaultInterstitial: boolean;
  interstitialTitle: string;
  interstitialDescription: string;
  redirectDelay: number;
}

export type InterstitialMode = "default" | "always" | "never";

export interface LinkPayload {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  interstitial?: InterstitialMode;
  redirectDelay?: number | null; // number = per-link override, null = use global
}

export async function listLinks(): Promise<ShortLink[]> {
  const res = await fetch("/api/links", { headers: authHeaders() });
  if (res.status === 401) throw new Error("Unauthorized");
  return res.json() as Promise<ShortLink[]>;
}

export async function createLink(payload: LinkPayload): Promise<ShortLink> {
  const res = await fetch("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as ShortLink & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to create");
  return data;
}

export async function updateLink(
  id: string,
  payload: Omit<LinkPayload, "id">,
): Promise<ShortLink> {
  const res = await fetch(`/api/links/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as ShortLink & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to update");
  return data;
}

export async function deleteLink(id: string): Promise<void> {
  await fetch(`/api/links/${id}`, { method: "DELETE", headers: authHeaders() });
}

export async function resolveLink(id: string): Promise<ResolvedLink | null> {
  const res = await fetch(`/api/resolve/${id}`);
  if (res.status === 404) return null;
  return res.json() as Promise<ResolvedLink>;
}

export async function getConfig(): Promise<GlobalConfig> {
  const res = await fetch("/api/config", { headers: authHeaders() });
  return res.json() as Promise<GlobalConfig>;
}

export async function saveConfig(
  config: Partial<GlobalConfig>,
): Promise<GlobalConfig> {
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(config),
  });
  return res.json() as Promise<GlobalConfig>;
}
