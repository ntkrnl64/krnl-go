CREATE TABLE links (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  interstitial INTEGER, -- NULL = default, 1 = always, 0 = never
  redirect_delay REAL   -- NULL = default
);

CREATE TABLE aliases (
  alias_id TEXT PRIMARY KEY,
  primary_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE
);

CREATE TABLE admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hash TEXT NOT NULL,
  salt TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_interstitial INTEGER NOT NULL DEFAULT 0,
  interstitial_title TEXT NOT NULL DEFAULT 'You are being redirected',
  interstitial_description TEXT NOT NULL DEFAULT 'You are about to visit an external website.',
  redirect_delay REAL NOT NULL DEFAULT 0
);

CREATE INDEX idx_links_url ON links(url);
CREATE INDEX idx_aliases_primary ON aliases(primary_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
