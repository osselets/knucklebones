CREATE TABLE identity_transfers (
  transfer_id TEXT PRIMARY KEY NOT NULL CHECK (length(transfer_id) = 36),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  player_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER,
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

CREATE INDEX identity_transfers_player
  ON identity_transfers (player_id, expires_at);

CREATE TRIGGER redeem_identity_transfer
AFTER UPDATE OF redeemed_at ON identity_transfers
WHEN OLD.redeemed_at IS NULL AND NEW.redeemed_at IS NOT NULL
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
    NEW.redeemed_at
  );

  UPDATE device_credentials
  SET revoked_at = NEW.redeemed_at
  WHERE player_id = NEW.player_id
    AND credential_id <> NEW.issued_credential_id
    AND revoked_at IS NULL
    AND NEW.revoke_other_devices = 1;

  UPDATE identity_transfers
  SET issued_secret_hash = NULL
  WHERE transfer_id = NEW.transfer_id;
END;
