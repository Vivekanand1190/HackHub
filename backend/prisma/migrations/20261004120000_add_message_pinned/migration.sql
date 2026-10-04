-- Pinned messages were previously tracked only in the browser, so a pin
-- vanished on reload and was never visible to anyone who joined later.
ALTER TABLE "Message" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
