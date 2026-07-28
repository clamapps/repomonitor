"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function LocalSentAt({ sentAt }: { sentAt: string }) {
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!isHydrated) return "SENT";

  return `SENT: ${new Date(sentAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}
