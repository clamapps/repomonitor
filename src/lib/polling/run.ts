import "server-only";

import {
  Condition,
  ConditionType,
  EventType,
  NotificationStatus,
  Prisma,
  RepoPollCursor,
  Repository,
  SubscriptionPollCursor,
  SubscriptionEvent,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { config } from "@/lib/config";
import { db } from "@/lib/db";
import {
  describeLine,
  lineChanged,
  textContains,
  TextEventMaterial,
} from "@/lib/domain/conditions";
import { escapeHtml } from "@/lib/email/message";
import { sendEmail } from "@/lib/email/sender";
import {
  compareCommits,
  getCommit,
  getFileLine,
  getRepository,
  listCommitsSince,
  listReleasesAfter,
  permanentGitHubAccessFailure,
} from "@/lib/github/client";
import { withGitHubAppToken } from "@/lib/github/app";
import {
  GitHubAuthorizationError,
  withPrivateRepositoryToken,
} from "@/lib/github/tokens";

type EventWithConditions = SubscriptionEvent & {
  conditions: Condition[];
};

class RepositoryVisibilityError extends Error {
  readonly code = "VISIBILITY_CHANGED";

  constructor(message: string) {
    super(message);
    this.name = "RepositoryVisibilityError";
  }
}

type CursorWork = Pick<
  RepoPollCursor | SubscriptionPollCursor,
  | "id"
  | "eventType"
  | "cursor"
  | "lastCommitSha"
  | "lastSuccessfulAt"
  | "lastError"
> & {
  kind: "repository" | "subscription";
  subscriptionId?: string;
  userId?: string;
  repository: Repository;
  subscriptions: Array<{
    events: EventWithConditions[];
  }>;
};

export type PollResult = {
  acquired: boolean;
  repositories: number;
  events: number;
  notificationsQueued: number;
  notificationsSent: number;
  subscriptionAlertsQueued: number;
  subscriptionAlertsSent: number;
  errors: string[];
};

function eventConditions(work: CursorWork): Condition[] {
  return work.subscriptions.flatMap((subscription) =>
    subscription.events
      .filter((event) => event.type === work.eventType && event.enabled)
      .flatMap((event) => event.conditions),
  );
}

function fileMaterial(
  files:
    | Array<{
        filename: string;
        previous_filename?: string;
        patch?: string;
      }>
    | undefined,
) {
  return (files ?? []).map((file) => ({
    filename: file.filename,
    previousFilename: file.previous_filename,
    patch: file.patch,
  }));
}

async function queueTextMatches(
  conditions: Condition[],
  eventKey: string,
  eventType: EventType,
  title: string,
  url: string,
  material: TextEventMaterial,
): Promise<number> {
  let queued = 0;
  for (const condition of conditions) {
    if (
      condition.type !== ConditionType.TEXT_CONTAINS ||
      !condition.textPattern ||
      !textContains(condition.textPattern, material)
    ) {
      continue;
    }
    const created = await createNotification(
      condition.id,
      eventKey,
      eventType,
      title,
      url,
      `Matched text “${condition.textPattern}”.`,
    );
    if (created) queued += 1;
  }
  return queued;
}

async function evaluateLineConditions(
  token: string,
  repository: Repository,
  conditions: Condition[],
  commitSha: string,
  eventKey: string,
  eventType: EventType,
  title: string,
  url: string,
): Promise<number> {
  let queued = 0;
  for (const condition of conditions) {
    if (
      condition.type !== ConditionType.LINE_CHANGE ||
      !condition.filePath ||
      !condition.lineNumber
    ) {
      continue;
    }
    const current = await getFileLine(
      token,
      repository.owner,
      repository.name,
      condition.filePath,
      condition.lineNumber,
      commitSha,
    );
    const previous = condition.lastObservedLineContent;
    if (lineChanged(previous, current)) {
      const summary = `${condition.filePath}:${condition.lineNumber} changed from “${describeLine(previous)}” to “${describeLine(current)}”.`;
      const created = await createNotification(
        condition.id,
        eventKey,
        eventType,
        title,
        url,
        summary,
      );
      if (created) queued += 1;
    }
    await db.condition.update({
      where: { id: condition.id },
      data: {
        lastObservedCommitSha: commitSha,
        lastObservedLineContent: current,
      },
    });
    condition.lastObservedCommitSha = commitSha;
    condition.lastObservedLineContent = current;
  }
  return queued;
}

async function createNotification(
  conditionId: string,
  eventKey: string,
  eventType: EventType,
  eventTitle: string,
  eventUrl: string,
  summary: string,
): Promise<boolean> {
  try {
    await db.notification.create({
      data: {
        conditionId,
        eventKey,
        eventType,
        eventTitle,
        eventUrl,
        summary,
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

async function pollCommits(work: CursorWork, token: string): Promise<number> {
  const { repository } = work;
  const head = await getCommit(
    token,
    repository.owner,
    repository.name,
    repository.defaultBranch,
  );
  if (head.sha === work.cursor) {
    await markCursorSuccess(work, work.cursor, head.sha);
    return 0;
  }

  const since =
    work.lastSuccessfulAt ?? new Date(Date.now() - 25 * 60 * 60 * 1000);
  let commits = await listCommitsSince(
    token,
    repository.owner,
    repository.name,
    repository.defaultBranch,
    since,
  );
  const cursorIndex = commits.findIndex((commit) => commit.sha === work.cursor);
  if (cursorIndex >= 0) commits = commits.slice(cursorIndex + 1);
  commits = commits.filter((commit) => commit.sha !== work.cursor);
  if (!commits.some((commit) => commit.sha === head.sha)) commits.push(head);

  const conditions = eventConditions(work);
  let queued = 0;
  for (const commit of commits) {
    const detail = await getCommit(
      token,
      repository.owner,
      repository.name,
      commit.sha,
    );
    const shortSha = detail.sha.slice(0, 7);
    const firstLine = detail.commit.message.split("\n")[0] ?? shortSha;
    const title = `${repository.fullName}: ${firstLine}`;
    const eventKey = `commit:${detail.sha}`;
    queued += await queueTextMatches(
      conditions,
      eventKey,
      EventType.COMMIT,
      title,
      detail.html_url,
      {
        title: detail.commit.message,
        files: fileMaterial(detail.files),
      },
    );
    queued += await evaluateLineConditions(
      token,
      repository,
      conditions,
      detail.sha,
      eventKey,
      EventType.COMMIT,
      title,
      detail.html_url,
    );
  }
  await markCursorSuccess(work, head.sha, head.sha);
  return queued;
}

async function pollReleases(work: CursorWork, token: string): Promise<number> {
  const { repository } = work;
  const releases = await listReleasesAfter(
    token,
    repository.owner,
    repository.name,
    work.cursor,
  );
  if (releases.length === 0) {
    await markCursorSuccess(work, work.cursor, work.lastCommitSha);
    return 0;
  }

  const conditions = eventConditions(work);
  let queued = 0;
  let previousCommit = work.lastCommitSha;
  let cursor = work.cursor;
  for (const release of releases) {
    const releaseCommit = await getCommit(
      token,
      repository.owner,
      repository.name,
      release.tag_name,
    );
    let comparison:
      | Awaited<ReturnType<typeof compareCommits>>
      | undefined;
    if (previousCommit && previousCommit !== releaseCommit.sha) {
      comparison = await compareCommits(
        token,
        repository.owner,
        repository.name,
        previousCommit,
        releaseCommit.sha,
      ).catch(() => undefined);
    }
    const title = `${repository.fullName} released ${release.name || release.tag_name}`;
    const eventKey = `release:${release.id}`;
    queued += await queueTextMatches(
      conditions,
      eventKey,
      EventType.RELEASE,
      title,
      release.html_url,
      {
        title: release.name || release.tag_name,
        body: release.body,
        commitMessages: comparison?.commits.map(
          (commit) => commit.commit.message,
        ),
        files: fileMaterial(comparison?.files),
      },
    );
    queued += await evaluateLineConditions(
      token,
      repository,
      conditions,
      releaseCommit.sha,
      eventKey,
      EventType.RELEASE,
      title,
      release.html_url,
    );
    cursor = String(release.id);
    previousCommit = releaseCommit.sha;
  }
  await markCursorSuccess(work, cursor, previousCommit);
  return queued;
}

async function markCursorSuccess(
  work: CursorWork,
  cursor: string,
  lastCommitSha?: string | null,
) {
  const data = {
    cursor,
    lastCommitSha,
    lastSuccessfulAt: new Date(),
    lastError: null,
  };
  if (work.kind === "repository") {
    await db.repoPollCursor.update({ where: { id: work.id }, data });
  } else {
    await db.subscriptionPollCursor.update({ where: { id: work.id }, data });
  }
}

async function markCursorError(work: CursorWork, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const data = { lastError: message.slice(0, 1000) };
  if (work.kind === "repository") {
    await db.repoPollCursor.update({ where: { id: work.id }, data });
  } else {
    await db.subscriptionPollCursor.update({ where: { id: work.id }, data });
  }
  return message;
}

function permanentAccessFailure(error: unknown) {
  if (error instanceof RepositoryVisibilityError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  if (error instanceof GitHubAuthorizationError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return permanentGitHubAccessFailure(error);
}

async function markSubscriptionsErrored(
  where: Prisma.SubscriptionWhereInput,
  code: string,
  message: string,
): Promise<number> {
  const subscriptions = await db.subscription.findMany({
    where: { ...where, enabled: true, errorAt: null },
    select: { id: true },
  });
  if (subscriptions.length === 0) return 0;

  const errorAt = new Date();
  await db.$transaction(async (tx) => {
    for (const subscription of subscriptions) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          errorCode: code,
          errorMessage: message,
          errorAt,
        },
      });
      await tx.subscriptionErrorAlert.upsert({
        where: { subscriptionId: subscription.id },
        update: {
          errorCode: code,
          message,
          status: NotificationStatus.PENDING,
          attempts: 0,
          lastError: null,
          sentAt: null,
        },
        create: {
          subscriptionId: subscription.id,
          errorCode: code,
          message,
        },
      });
    }
  });
  return subscriptions.length;
}

function randomDelay(): number {
  const low = Math.min(
    config().EMAIL_DELAY_MIN_MS,
    config().EMAIL_DELAY_MAX_MS,
  );
  const high = Math.max(
    config().EMAIL_DELAY_MIN_MS,
    config().EMAIL_DELAY_MAX_MS,
  );
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

async function deliverNotifications(): Promise<number> {
  const stale = new Date(Date.now() - 15 * 60 * 1000);
  await db.notification.updateMany({
    where: {
      status: NotificationStatus.SENDING,
      updatedAt: { lt: stale },
    },
    data: { status: NotificationStatus.PENDING },
  });

  const pending = await db.notification.findMany({
    where: { status: NotificationStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: {
      condition: {
        include: {
          subscriptionEvent: {
            include: {
              subscription: {
                include: {
                  user: { include: { notificationEmail: true } },
                  repository: true,
                },
              },
            },
          },
        },
      },
    },
  });
  let sent = 0;
  for (const notification of pending) {
    const claimed = await db.notification.updateMany({
      where: {
        id: notification.id,
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.SENDING,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;

    const subscription = notification.condition.subscriptionEvent.subscription;
    const address = subscription.user.notificationEmail;
    if (!address?.verifiedAt) {
      await db.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          lastError: "No verified notification email is selected",
        },
      });
      continue;
    }

    const delay = randomDelay();
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      const repository = subscription.repository;
      const settingsUrl = `${config().APP_URL}/settings`;
      await sendEmail({
        to: address.email,
        subject: `[RepoMonitor] ${notification.eventTitle}`,
        text: `${notification.summary}\n\nRepository: ${repository.fullName}\nEvent: ${notification.eventUrl}\n\nNotification settings: ${settingsUrl}`,
        html: `<p>${escapeHtml(notification.summary)}</p><p><strong>Repository:</strong> ${escapeHtml(repository.fullName)}</p><p><a href="${escapeHtml(notification.eventUrl)}">View on GitHub</a></p><p><a href="${escapeHtml(settingsUrl)}">Notification settings</a></p>`,
      });
      await db.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const attempts = notification.attempts + 1;
      await db.notification.update({
        where: { id: notification.id },
        data: {
          status:
            attempts >= 3
              ? NotificationStatus.FAILED
              : NotificationStatus.PENDING,
          lastError: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000,
          ),
        },
      });
    }
  }
  return sent;
}

async function deliverSubscriptionErrorAlerts(): Promise<number> {
  const stale = new Date(Date.now() - 15 * 60 * 1000);
  await db.subscriptionErrorAlert.updateMany({
    where: {
      status: NotificationStatus.SENDING,
      updatedAt: { lt: stale },
    },
    data: { status: NotificationStatus.PENDING },
  });

  const pending = await db.subscriptionErrorAlert.findMany({
    where: { status: NotificationStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: {
      subscription: {
        include: {
          repository: true,
          user: { include: { notificationEmail: true } },
        },
      },
    },
  });
  let sent = 0;
  for (const alert of pending) {
    const claimed = await db.subscriptionErrorAlert.updateMany({
      where: {
        id: alert.id,
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.SENDING,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;

    const address = alert.subscription.user.notificationEmail;
    if (!address?.verifiedAt) {
      await db.subscriptionErrorAlert.update({
        where: { id: alert.id },
        data: {
          status: NotificationStatus.FAILED,
          lastError: "No verified notification email is selected",
        },
      });
      continue;
    }

    const delay = randomDelay();
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      const repository = alert.subscription.repository;
      const subscriptionUrl = `${config().APP_URL}/subscriptions/${alert.subscription.id}`;
      await sendEmail({
        to: address.email,
        subject: `[RepoMonitor] Monitoring paused for ${repository.fullName}`,
        text: `${alert.message}\n\nRepository: ${repository.fullName}\nMonitoring will not be attempted again until access is restored and you retry the subscription.\n\nReview subscription: ${subscriptionUrl}`,
        html: `<p>${escapeHtml(alert.message)}</p><p><strong>Repository:</strong> ${escapeHtml(repository.fullName)}</p><p>Monitoring will not be attempted again until access is restored and you retry the subscription.</p><p><a href="${escapeHtml(subscriptionUrl)}">Review subscription</a></p>`,
      });
      await db.subscriptionErrorAlert.update({
        where: { id: alert.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const attempts = alert.attempts + 1;
      await db.subscriptionErrorAlert.update({
        where: { id: alert.id },
        data: {
          status:
            attempts >= 3
              ? NotificationStatus.FAILED
              : NotificationStatus.PENDING,
          lastError: (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000,
          ),
        },
      });
    }
  }
  return sent;
}

async function acquireLease(owner: string): Promise<boolean> {
  const now = new Date();
  const leaseUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
  try {
    await db.pollLease.create({
      data: { id: "daily", owner, leaseUntil },
    });
    return true;
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }
  const claimed = await db.pollLease.updateMany({
    where: { id: "daily", leaseUntil: { lt: now } },
    data: { owner, leaseUntil },
  });
  return claimed.count === 1;
}

export async function runPollingCycle(
  source: "scheduled" | "manual",
): Promise<PollResult> {
  const owner = `${source}:${process.pid}:${randomUUID()}`;
  const result: PollResult = {
    acquired: false,
    repositories: 0,
    events: 0,
    notificationsQueued: 0,
    notificationsSent: 0,
    subscriptionAlertsQueued: 0,
    subscriptionAlertsSent: 0,
    errors: [],
  };
  if (!(await acquireLease(owner))) return result;
  result.acquired = true;

  try {
    const publicCursorRecords = await db.repoPollCursor.findMany({
      where: {
        repository: {
          isPrivate: false,
          subscriptions: {
            some: {
              enabled: true,
              errorAt: null,
              events: {
                some: {
                  enabled: true,
                  conditions: { some: {} },
                },
              },
            },
          },
        },
      },
      include: {
        repository: {
          include: {
            subscriptions: {
              where: { enabled: true, errorAt: null },
              select: {
                events: {
                  where: { enabled: true },
                  include: { conditions: true },
                },
              },
            },
          },
        },
      },
    });
    const privateCursorRecords = await db.subscriptionPollCursor.findMany({
      where: {
        subscription: {
          enabled: true,
          errorAt: null,
          repository: { isPrivate: true },
          events: {
            some: {
              enabled: true,
              conditions: { some: {} },
            },
          },
        },
      },
      include: {
        subscription: {
          include: {
            repository: true,
            events: {
              where: { enabled: true },
              include: { conditions: true },
            },
          },
        },
      },
    });
    const publicCursors: CursorWork[] = publicCursorRecords.map((cursor) => ({
      ...cursor,
      kind: "repository",
      repository: cursor.repository,
      subscriptions: cursor.repository.subscriptions,
    }));
    const privateCursors: CursorWork[] = privateCursorRecords.map((cursor) => ({
      ...cursor,
      kind: "subscription",
      subscriptionId: cursor.subscriptionId,
      userId: cursor.subscription.userId,
      repository: cursor.subscription.repository,
      subscriptions: [{ events: cursor.subscription.events }],
    }));

    const repositoryIds = new Set<string>();
    const blockedPublicRepositories = new Set<string>();
    const validatedPublicRepositories = new Set<string>();
    for (const cursor of publicCursors) {
      if (blockedPublicRepositories.has(cursor.repository.id)) continue;
      if (eventConditions(cursor).length === 0) continue;
      repositoryIds.add(cursor.repository.id);
      result.events += 1;
      try {
        const queued = await withGitHubAppToken(
          async (token) => {
            if (!validatedPublicRepositories.has(cursor.repository.id)) {
              const current = await getRepository(
                token,
                cursor.repository.owner,
                cursor.repository.name,
              );
              if (current.private) {
                throw new RepositoryVisibilityError(
                  "This repository is now private. Remove and add the subscription again so each account can authorize private polling.",
                );
              }
              validatedPublicRepositories.add(cursor.repository.id);
            }
            return cursor.eventType === EventType.COMMIT
              ? pollCommits(cursor, token)
              : pollReleases(cursor, token);
          },
        );
        result.notificationsQueued += queued;
      } catch (error) {
        const permanent = permanentAccessFailure(error);
        if (permanent) {
          blockedPublicRepositories.add(cursor.repository.id);
          result.subscriptionAlertsQueued += await markSubscriptionsErrored(
            { repositoryId: cursor.repository.id },
            permanent.code,
            permanent.message,
          );
        }
        result.errors.push(
          `${cursor.repository.fullName} ${cursor.eventType.toLowerCase()}: ${await markCursorError(cursor, error)}`,
        );
      }
    }

    const blockedPrivateSubscriptions = new Set<string>();
    const validatedPrivateSubscriptions = new Set<string>();
    for (const cursor of privateCursors) {
      const subscriptionId = cursor.subscriptionId!;
      if (blockedPrivateSubscriptions.has(subscriptionId)) continue;
      if (eventConditions(cursor).length === 0) continue;
      repositoryIds.add(cursor.repository.id);
      result.events += 1;
      try {
        const queued = await withPrivateRepositoryToken(
          cursor.userId!,
          async (token) => {
            if (!validatedPrivateSubscriptions.has(subscriptionId)) {
              const current = await getRepository(
                token,
                cursor.repository.owner,
                cursor.repository.name,
              );
              if (!current.private) {
                throw new RepositoryVisibilityError(
                  "This repository is now public. Remove and add the subscription again to switch to shared GitHub App polling.",
                );
              }
              validatedPrivateSubscriptions.add(subscriptionId);
            }
            return cursor.eventType === EventType.COMMIT
              ? pollCommits(cursor, token)
              : pollReleases(cursor, token);
          },
        );
        result.notificationsQueued += queued;
      } catch (error) {
        const permanent = permanentAccessFailure(error);
        if (permanent) {
          blockedPrivateSubscriptions.add(subscriptionId);
          result.subscriptionAlertsQueued += await markSubscriptionsErrored(
            { id: subscriptionId },
            permanent.code,
            permanent.message,
          );
        }
        result.errors.push(
          `${cursor.repository.fullName} ${cursor.eventType.toLowerCase()}: ${await markCursorError(cursor, error)}`,
        );
      }
    }
    result.repositories = repositoryIds.size;
    result.notificationsSent = await deliverNotifications();
    result.subscriptionAlertsSent = await deliverSubscriptionErrorAlerts();
    return result;
  } finally {
    await db.pollLease.updateMany({
      where: { id: "daily", owner },
      data: {
        leaseUntil: new Date(0),
        lastRunAt: new Date(),
        lastResult: JSON.stringify(result).slice(0, 4000),
      },
    });
  }
}
