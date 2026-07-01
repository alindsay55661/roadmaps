export const migration = `
  ALTER TABLE user_invites ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

  UPDATE schema_version SET version = 2, updated_at = UNIXEPOCH() WHERE version = 1;
  INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (2, UNIXEPOCH());
`
