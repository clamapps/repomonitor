import "server-only";

import { z } from "zod";

const baseSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SUPER_ADMIN_GITHUB_LOGINS: z.string().default(""),
  POLL_CRON: z.string().default("17 3 * * *"),
  POLL_TIMEZONE: z.string().default("UTC"),
  EMAIL_DELAY_MIN_MS: z.coerce.number().int().min(0).default(2000),
  EMAIL_DELAY_MAX_MS: z.coerce.number().int().min(0).default(10000),
  SENDMAIL_PATH: z.string().default("/usr/sbin/sendmail"),
  MAIL_FROM: z.string().default("RepoMonitor <repomonitor@localhost>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof baseSchema>;

let cached: AppConfig | undefined;

export function config(): AppConfig {
  cached ??= baseSchema.parse(process.env);
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isSuperAdminLogin(login: string): boolean {
  const admins = config()
    .SUPER_ADMIN_GITHUB_LOGINS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(login.toLowerCase());
}

export function googleOAuthConfigured(): boolean {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = config();
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}
