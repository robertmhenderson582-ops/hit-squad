"use client";

import { useInbox } from "@/components/InboxProvider";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { canSeeInboxUi } from "@/lib/inbox-circle";

export function InboxBadge() {
  const inbox = useInbox();
  const lens = useLensUser();
  const desk = useOwnerDesk();
  if (!canSeeInboxUi(lens, desk?.showInboxSuggestionBox) || inbox.unread <= 0) return null;
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
