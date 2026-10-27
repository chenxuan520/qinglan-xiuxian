CREATE TABLE ad_admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE ad_sessions (
  token_hash TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE ad_login_limits (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  resets INTEGER NOT NULL
);
CREATE TRIGGER ad_password_changed AFTER UPDATE OF password_hash ON ad_admin
BEGIN
  DELETE FROM ad_sessions;
END;
