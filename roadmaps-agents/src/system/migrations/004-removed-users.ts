export const migration = `
  CREATE TABLE IF NOT EXISTS removed_users (
    email TEXT PRIMARY KEY,
    removed_at INTEGER NOT NULL
  );

  UPDATE schema_version SET version = 4, updated_at = UNIXEPOCH() WHERE version = 3;
  INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (4, UNIXEPOCH());
`
