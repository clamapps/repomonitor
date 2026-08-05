-- CreateTable
CREATE TABLE "EmailVerificationSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmailVerificationSend_userId_createdAt_idx" ON "EmailVerificationSend"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationSend_userId_email_createdAt_idx" ON "EmailVerificationSend"("userId", "email", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationSend_createdAt_idx" ON "EmailVerificationSend"("createdAt");
