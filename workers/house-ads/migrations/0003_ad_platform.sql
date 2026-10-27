ALTER TABLE ad_config ADD COLUMN settings TEXT NOT NULL DEFAULT '{"provider":"house","adsense":{"client":"ca-pub-9047842625721721","testMode":false,"placements":{"revive":"qinglan-revive","reward-root":"qinglan-reward-root","reward-supplies":"qinglan-reward-supplies","lifespan":"qinglan-lifespan"}}}';
CREATE TABLE ad_receipts (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  placement TEXT NOT NULL,
  day TEXT NOT NULL,
  origin TEXT NOT NULL,
  verification INTEGER NOT NULL DEFAULT 0 CHECK (verification IN (0, 1)),
  expires INTEGER NOT NULL,
  flags INTEGER NOT NULL DEFAULT 0 CHECK (flags BETWEEN 0 AND 15)
);
CREATE INDEX ad_receipts_expiry ON ad_receipts (expires);
CREATE TABLE ad_daily_metrics (
  day TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  placement TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  shown INTEGER NOT NULL DEFAULT 0,
  clicked INTEGER NOT NULL DEFAULT 0,
  watched INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ad_id, provider, placement)
);
CREATE TRIGGER ad_receipt_created AFTER INSERT ON ad_receipts WHEN new.verification = 0
BEGIN
  INSERT INTO ad_daily_metrics (day, ad_id, provider, placement, ad_name, requests)
  VALUES (new.day, new.ad_id, new.provider, new.placement, new.ad_name, 1)
  ON CONFLICT(day, ad_id, provider, placement) DO UPDATE SET requests = requests + 1, ad_name = new.ad_name;
END;
CREATE TRIGGER ad_receipt_events AFTER UPDATE OF flags ON ad_receipts WHEN new.verification = 0
BEGIN
  UPDATE ad_daily_metrics SET
    shown = shown + ((new.flags & 1) != 0) - ((old.flags & 1) != 0),
    clicked = clicked + ((new.flags & 2) != 0) - ((old.flags & 2) != 0),
    watched = watched + ((new.flags & 4) != 0) - ((old.flags & 4) != 0),
    claimed = claimed + ((new.flags & 8) != 0) - ((old.flags & 8) != 0)
  WHERE day = new.day AND ad_id = new.ad_id AND provider = new.provider AND placement = new.placement;
END;
