CREATE TABLE leaderboard (
  name_key TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  owner_hash TEXT NOT NULL CHECK(length(owner_hash) = 64),
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 9007199254740991),
  grade TEXT NOT NULL,
  title TEXT NOT NULL,
  life_mode TEXT NOT NULL CHECK(life_mode IN ('normal', 'extreme')),
  ending TEXT NOT NULL CHECK(ending IN ('lifespan', 'tribulation', 'ambush', 'extreme', 'immortal')),
  submission_hash TEXT NOT NULL CHECK(length(submission_hash) = 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX leaderboard_ranking ON leaderboard(score DESC, updated_at ASC, name_key ASC);
