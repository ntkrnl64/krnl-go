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

export interface StatusResponse {
  setup: boolean;
  noTokenCheck?: boolean;
  kvPending?: boolean;
  backendJs?: boolean;
  prismEnabled?: boolean;
  prismBound?: boolean;
  passwordSet?: boolean;
}

export async function checkStatus(): Promise<StatusResponse> {
  const res = await fetch("/api/status");
  return res.json() as Promise<StatusResponse>;
}

export type PrismIntent = "login" | "claim" | "migrate";

export async function startPrismLogin(intent: PrismIntent): Promise<string> {
  const res = await fetch("/api/auth/prism/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ intent }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url)
    throw new Error(data.error ?? "Failed to start Prism login");
  return data.url;
}

export interface PrismConfigInfo {
  configured: boolean;
  source?: "db" | "env";
  baseUrl?: string;
  clientId?: string;
}

export async function getPrismConfig(): Promise<PrismConfigInfo> {
  const res = await fetch("/api/prism/config", { headers: authHeaders() });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to load Prism config");
  }
  return res.json() as Promise<PrismConfigInfo>;
}

export interface PrismConfigInput {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export async function savePrismConfig(input: PrismConfigInput): Promise<void> {
  const res = await fetch("/api/prism/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to save Prism config");
  }
}

export async function clearPrismConfig(): Promise<void> {
  const res = await fetch("/api/prism/config", {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Failed to clear Prism config");
  }
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

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch("/api/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
}

export interface MultiDestination {
  id?: number;
  url: string;
  title: string;
  groupName?: string;
  groupTitle?: string;
  groupDescription?: string;
  autoRedirectChance: number;
  position: number;
}

export interface ShortLink {
  id: string;
  url: string;
  createdAt: number;
  title?: string;
  description?: string;
  interstitial?: boolean;
  redirectDelay?: number;
  proxy?: boolean;
  aliases?: string[];
  multi?: boolean;
  destinations?: MultiDestination[];
  customJsFrontend?: string;
  customJsBackend?: string;
}

export interface ResolvedLink {
  url: string;
  title: string;
  description: string;
  redirectDelay: number;
  customJs?: string;
}

export interface ResolvedMultiLink {
  multi: true;
  title: string;
  description: string;
  destinations: MultiDestination[];
  customJs?: string;
}

export interface GlobalConfig {
  defaultInterstitial: boolean;
  interstitialTitle: string;
  interstitialDescription: string;
  redirectDelay: number;
  defaultProxy: boolean;
}

export type TriStateMode = "default" | "always" | "never";

/** @deprecated Use TriStateMode instead */
export type InterstitialMode = TriStateMode;

export interface LinkPayload {
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

export interface CreateLinkResult extends ShortLink {
  /** Present when the new ID was auto-merged as an alias of an existing link. */
  merged?: boolean;
  /** The alias ID that was created (only when merged). */
  aliasId?: string;
}

export async function listLinks(): Promise<ShortLink[]> {
  const res = await fetch("/api/links", { headers: authHeaders() });
  if (res.status === 401) throw new Error("Unauthorized");
  return res.json() as Promise<ShortLink[]>;
}

export async function createLink(
  payload: LinkPayload,
): Promise<CreateLinkResult> {
  const res = await fetch("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as CreateLinkResult & { error?: string };
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
  await fetch(`/api/links/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function addAlias(id: string, alias: string): Promise<ShortLink> {
  const res = await fetch(`/api/links/${id}/aliases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ alias }),
  });
  const data = (await res.json()) as ShortLink & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to add alias");
  return data;
}

export async function removeAlias(
  id: string,
  aliasId: string,
): Promise<ShortLink> {
  const res = await fetch(`/api/links/${id}/aliases/${aliasId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = (await res.json()) as ShortLink & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to remove alias");
  return data;
}

export async function resolveLink(
  id: string,
): Promise<ResolvedLink | ResolvedMultiLink | null> {
  const res = await fetch(`/api/resolve/${id}`);
  if (res.status === 404) return null;
  return res.json() as Promise<ResolvedLink | ResolvedMultiLink>;
}

export async function mergeLinks(ids?: string[]): Promise<{ merged: number }> {
  const res = await fetch("/api/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(ids ? { ids } : {}),
  });
  const data = (await res.json()) as { merged: number; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to merge");
  return data;
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

export interface MigrateResult {
  links: number;
  aliases: number;
  admin: boolean;
  config: boolean;
}

export async function migrateFromKV(): Promise<MigrateResult> {
  const res = await fetch("/api/migrate-kv", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  const data = (await res.json()) as {
    migrated?: MigrateResult;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Migration failed");
  return data.migrated!;
}
