CREATE TABLE leaderboard_blocks (
  name_key TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  owner_hash TEXT NOT NULL CHECK(length(owner_hash) = 64),
  blocked_at TEXT NOT NULL
) STRICT;
CREATE INDEX leaderboard_blocks_owner ON leaderboard_blocks(owner_hash);
