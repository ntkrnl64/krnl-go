/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Set to any value to bypass token auth entirely (e.g. when behind Cloudflare Access). */
  KRNLGO_NO_TOKEN?: string;
  /** Optional KV binding for migrating data from KV to D1. Remove after migration. */
  LEGACY_KV?: KVNamespace;
}
