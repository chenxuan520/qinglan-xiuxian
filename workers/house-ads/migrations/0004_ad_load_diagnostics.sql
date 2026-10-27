CREATE TABLE IF NOT EXISTS ad_load_diagnostics (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  placement TEXT NOT NULL,
  device TEXT NOT NULL,
  browser TEXT NOT NULL,
  stage TEXT NOT NULL,
  code TEXT NOT NULL,
  status INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  elapsed_total INTEGER NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (day, version, placement, device, browser, stage, code, status)
);
