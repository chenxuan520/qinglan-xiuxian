CREATE TABLE ad_access_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  key_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TRIGGER ad_access_key_password_changed AFTER UPDATE OF password_hash ON ad_admin
BEGIN
  DELETE FROM ad_access_keys;
END;
