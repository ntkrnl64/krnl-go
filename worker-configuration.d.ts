/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Set to any value to bypass token auth entirely (e.g. when behind Cloudflare Access). */
  KRNLGO_NO_TOKEN?: string;
  /** Optional Dynamic Workers loader for executing custom backend JS. */
  LOADER?: WorkerLoader;
  /** Optional KV binding for migrating data from KV to D1. Remove after migration. */
  LEGACY_KV?: KVNamespace;
  /** Prism instance base URL (e.g. "https://id.example.com"). When set,
   *  Prism becomes available as an authentication source. */
  PRISM_BASE_URL?: string;
  /** OAuth client ID issued by the Prism instance. */
  PRISM_CLIENT_ID?: string;
  /** OAuth client secret issued by the Prism instance.
   *  Set via `wrangler secret put PRISM_CLIENT_SECRET`. */
  PRISM_CLIENT_SECRET?: string;
}
