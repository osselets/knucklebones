CREATE TABLE recovery_credentials (
  player_id TEXT PRIMARY KEY NOT NULL,
  verifier_hash TEXT NOT NULL UNIQUE CHECK (length(verifier_hash) = 64),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at INTEGER NOT NULL,
  rotated_at INTEGER NOT NULL,
  issued_credential_id TEXT CHECK (
    issued_credential_id IS NULL OR length(issued_credential_id) = 36
  ),
  issued_secret_hash TEXT CHECK (
    issued_secret_hash IS NULL OR length(issued_secret_hash) = 64
  ),
  revoke_other_devices INTEGER NOT NULL DEFAULT 0 CHECK (
    revoke_other_devices IN (0, 1)
  ),
  FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE TRIGGER redeem_recovery_credential
AFTER UPDATE OF verifier_hash ON recovery_credentials
WHEN NEW.issued_credential_id IS NOT NULL
  AND NEW.issued_secret_hash IS NOT NULL
BEGIN
  INSERT INTO device_credentials (
    credential_id,
    player_id,
    secret_hash,
    created_at
  ) VALUES (
    NEW.issued_credential_id,
    NEW.player_id,
    NEW.issued_secret_hash,
    NEW.rotated_at
  );

  UPDATE device_credentials
  SET revoked_at = NEW.rotated_at
  WHERE player_id = NEW.player_id
    AND credential_id <> NEW.issued_credential_id
    AND revoked_at IS NULL
    AND NEW.revoke_other_devices = 1;

  UPDATE recovery_credentials
  SET issued_credential_id = NULL,
      issued_secret_hash = NULL,
      revoke_other_devices = 0
  WHERE player_id = NEW.player_id;
END;
