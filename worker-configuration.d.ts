/// <reference types="@cloudflare/workers-types" />

interface Env {
  LINKS: KVNamespace;
  ASSETS: Fetcher;
  /** Set to any value to bypass token auth entirely (e.g. when behind Cloudflare Access). */
  KRNLGO_NO_TOKEN?: string;
}
