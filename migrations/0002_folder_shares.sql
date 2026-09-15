ALTER TABLE folders ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX folders_share_token ON folders(share_token);
