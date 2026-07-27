import { EventType } from "@prisma/client";

export function EventBadge({ type }: { type: EventType }) {
  return (
    <span className={`event-badge event-${type.toLowerCase()}`}>
      <span className="event-symbol" aria-hidden="true">
        {type === EventType.COMMIT ? "↗" : "◆"}
      </span>
      {type === EventType.COMMIT ? "Commits" : "Releases"}
    </span>
  );
}
