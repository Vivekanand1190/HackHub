-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "column" TEXT NOT NULL DEFAULT 'todo',
    "assigneeId" TEXT,
    "teamId" TEXT NOT NULL,
    "deadline" DATETIME,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "column", "createdAt", "deadline", "description", "id", "teamId", "title", "updatedAt") SELECT "assigneeId", "column", "createdAt", "deadline", "description", "id", "teamId", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "whiteboardData" TEXT NOT NULL DEFAULT '[]',
    "copilotState" TEXT NOT NULL DEFAULT '{}',
    "milestones" TEXT NOT NULL DEFAULT '[]',
    "githubRepo" TEXT NOT NULL DEFAULT '',
    "unlockedAvatars" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("copilotState", "createdAt", "id", "joinCode", "leaderId", "name", "updatedAt", "whiteboardData") SELECT "copilotState", "createdAt", "id", "joinCode", "leaderId", "name", "updatedAt", "whiteboardData" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_joinCode_key" ON "Team"("joinCode");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "avatar" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Developer',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "badges" TEXT NOT NULL DEFAULT '[]',
    "roleBadge" TEXT NOT NULL DEFAULT 'Contributor',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "badges", "createdAt", "email", "googleId", "id", "name", "passwordHash", "role", "updatedAt", "xp") SELECT "avatar", "badges", "createdAt", "email", "googleId", "id", "name", "passwordHash", "role", "updatedAt", "xp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
