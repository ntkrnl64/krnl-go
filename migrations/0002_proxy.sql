ALTER TABLE links ADD COLUMN proxy INTEGER; -- NULL = default, 1 = always, 0 = never
ALTER TABLE config ADD COLUMN default_proxy INTEGER NOT NULL DEFAULT 0;
