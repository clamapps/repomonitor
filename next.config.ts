import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: [
    "@prisma/adapter-better-sqlite3",
    "@prisma/client",
    "better-sqlite3",
    "node-cron",
  ],
};

export default nextConfig;
