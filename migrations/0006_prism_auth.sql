-- Prism (OAuth 2.0 / OIDC) auth support.
-- admin.sub holds the bound Prism subject ID; when set, password auth is
-- disabled and Prism becomes the sole source of truth. Existing rows keep
-- their hash/salt so installations can migrate at their own pace.

CREATE TABLE admin_new (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hash TEXT,
  salt TEXT,
  sub TEXT
);

INSERT INTO admin_new (id, hash, salt) SELECT id, hash, salt FROM admin;
DROP TABLE admin;
ALTER TABLE admin_new RENAME TO admin;

-- Server-side OAuth flow state: PKCE verifier + intent, bound to a one-time
-- random `state` parameter. Rows are consumed on callback and pruned on TTL.
CREATE TABLE oauth_state (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  intent TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_oauth_state_expires ON oauth_state(expires_at);

CREATE TABLE prism_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
