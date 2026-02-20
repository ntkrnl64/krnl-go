/// <reference types="@cloudflare/workers-types" />

interface Env {
  LINKS: KVNamespace;
  ASSETS: Fetcher;
}
