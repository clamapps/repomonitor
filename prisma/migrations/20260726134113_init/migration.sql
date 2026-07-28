-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubId" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "notificationEmailId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_notificationEmailId_fkey" FOREIGN KEY ("notificationEmailId") REFERENCES "EmailAddress" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GitHubCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "scopes" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "invalidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GitHubCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "verificationHash" TEXT,
    "verificationExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "htmlUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "textPattern" TEXT,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "baselineCommitSha" TEXT,
    "baselineLineContent" TEXT,
    "lastObservedCommitSha" TEXT,
    "lastObservedLineContent" TEXT,
    "lastObservedLineState" TEXT,
    "movedLineNumber" INTEGER,
    "removedLineNumber" INTEGER,
    "notifyOnRemoved" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnMoved" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnChanged" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Condition_subscriptionEventId_fkey" FOREIGN KEY ("subscriptionEventId") REFERENCES "SubscriptionEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepoPollCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "lastCommitSha" TEXT,
    "lastSuccessfulAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepoPollCursor_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionPollCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "lastCommitSha" TEXT,
    "lastSuccessfulAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionPollCursor_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conditionId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "eventUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionErrorAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubscriptionErrorAlert_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PollLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "lastResult" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GmailSender" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "email" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "configuredByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GitHubAppConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "appId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenEncrypted" TEXT,
    "refreshTokenExpiresAt" DATETIME,
    "authorizedByUserId" TEXT,
    "authorizedGithubLogin" TEXT,
    "authorizedAt" DATETIME,
    "configuredByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubLogin_key" ON "User"("githubLogin");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubCredential_userId_key" ON "GitHubCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAddress_verificationHash_key" ON "EmailAddress"("verificationHash");

-- CreateIndex
CREATE INDEX "EmailAddress_verificationHash_idx" ON "EmailAddress"("verificationHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAddress_userId_email_key" ON "EmailAddress"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "Subscription_repositoryId_enabled_idx" ON "Subscription"("repositoryId", "enabled");

-- CreateIndex
CREATE INDEX "Subscription_enabled_errorAt_idx" ON "Subscription"("enabled", "errorAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_repositoryId_key" ON "Subscription"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_type_enabled_idx" ON "SubscriptionEvent"("type", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionEvent_subscriptionId_type_key" ON "SubscriptionEvent"("subscriptionId", "type");

-- CreateIndex
CREATE INDEX "Condition_subscriptionEventId_idx" ON "Condition"("subscriptionEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RepoPollCursor_repositoryId_eventType_key" ON "RepoPollCursor"("repositoryId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPollCursor_subscriptionId_eventType_key" ON "SubscriptionPollCursor"("subscriptionId", "eventType");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_conditionId_eventKey_key" ON "Notification"("conditionId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionErrorAlert_subscriptionId_key" ON "SubscriptionErrorAlert"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionErrorAlert_status_createdAt_idx" ON "SubscriptionErrorAlert"("status", "createdAt");
