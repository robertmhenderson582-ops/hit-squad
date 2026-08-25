"use client";

import { useInbox } from "@/components/InboxProvider";

export function InboxBadge() {
  const inbox = useInbox();
  if (inbox.unread <= 0) return null;
  return (
    <button
      type="button"
      onClick={inbox.openInbox}
      className="inbox-header-badge"
      aria-label={`${inbox.unread} unread inbox messages`}
    >
      Inbox {inbox.unread}
    </button>
  );
}
