ALTER TABLE links ADD COLUMN custom_js_frontend TEXT;
ALTER TABLE links ADD COLUMN custom_js_backend TEXT;
UPDATE links SET custom_js_frontend = custom_js WHERE custom_js IS NOT NULL;
ALTER TABLE links DROP COLUMN custom_js;
