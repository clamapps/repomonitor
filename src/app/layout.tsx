import type { Metadata } from "next";

import "./globals.css";

const appUrl = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "RepoMonitor",
    template: "%s · RepoMonitor",
  },
  description:
    "Watch the repository changes you care about and get a precise email when they happen.",
  openGraph: {
    title: "RepoMonitor",
    description:
      "Precise repository notifications for commits, releases, text, and line changes.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
