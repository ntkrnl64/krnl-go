-- Multi-destination links: one short link shows multiple choices to the visitor
ALTER TABLE links ADD COLUMN multi INTEGER; -- NULL/0 = normal link, 1 = multi-select

CREATE TABLE multi_destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  group_name TEXT,         -- destinations with same group_name share group_title/group_description
  group_title TEXT,
  group_description TEXT,
  auto_redirect_chance REAL NOT NULL DEFAULT 0,  -- 0–100 percentage
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_multi_dest_link ON multi_destinations(link_id);
