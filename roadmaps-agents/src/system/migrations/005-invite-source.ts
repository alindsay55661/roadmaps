export const migration = `
  ALTER TABLE user_invites ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';

  UPDATE user_invites SET source = 'team' WHERE team_id IS NOT NULL;

  UPDATE schema_version SET version = 5, updated_at = UNIXEPOCH() WHERE version = 4;
  INSERT OR IGNORE INTO schema_version (version, updated_at) VALUES (5, UNIXEPOCH());
`
