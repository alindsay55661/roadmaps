export const migration = `
  CREATE TABLE IF NOT EXISTS teams (
    team_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  UPDATE schema_version SET version = 3, updated_at = UNIXEPOCH() WHERE version = 2;
  INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (3, UNIXEPOCH());
`
