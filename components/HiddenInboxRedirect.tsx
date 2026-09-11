"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { inboxSuggestionBoxChromeOn } from "@/lib/inbox-circle";

const HIDDEN_PATHS = [/^\/inbox(?:\/|$)/, /^\/tickets(?:\/|$)/];

/** Soft-land deep links on Home while Inbox / Suggestion Box chrome is off. */
export function HiddenInboxRedirect() {
  const desk = useOwnerDesk();
  const router = useRouter();
  const pathname = usePathname() || "/";
  useEffect(() => {
    if (!desk?.inboxChromeReady) return;
    if (inboxSuggestionBoxChromeOn(desk.showInboxSuggestionBox)) return;
    if (!HIDDEN_PATHS.some((path) => path.test(pathname))) return;
    router.replace("/");
  }, [desk?.inboxChromeReady, desk?.showInboxSuggestionBox, pathname, router]);
  return null;
}
