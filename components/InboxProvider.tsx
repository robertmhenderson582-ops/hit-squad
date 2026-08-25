"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { playInboxChime } from "@/lib/chime";
import { useDisplay } from "@/components/DisplayProvider";
import { useSession } from "@/components/SessionProvider";

export type InboxThread = {
  id: string;
  name: string;
  preview: string;
  unread: boolean;
};

const OWNER_THREADS: InboxThread[] = [
  { id: "1", name: "James Cain", preview: "What do you think?", unread: true },
  { id: "2", name: "Mark H Schneider", preview: "Made some updates", unread: true },
  { id: "3", name: "Joseph Henderson", preview: "UI is inconsistent when changing ta...", unread: true },
];

type InboxState = {
  open: boolean;
  draft: boolean;
  toast: string | null;
  threads: InboxThread[];
  unread: number;
  openInbox: () => void;
  closeInbox: () => void;
  startDraft: () => void;
};

const InboxContext = createContext<InboxState | null>(null);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const { prefs } = useDisplay();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      setThreads([]);
      return;
    }
    setThreads(user.role === "owner" ? OWNER_THREADS : []);
  }, [status, user]);

  const unread = threads.filter((row) => row.unread).length;

  const announce = useCallback(
    (preview: string) => {
      setToast(preview);
      if (prefs.inboxSound) playInboxChime();
      window.setTimeout(() => setToast(null), 4200);
    },
    [prefs.inboxSound],
  );

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (user.role !== "owner") return;
    if (sessionStorage.getItem("hs_inbox_announced")) return;
    if (unread === 0) return;
    sessionStorage.setItem("hs_inbox_announced", "1");
    announce("New inbox message");
  }, [announce, status, unread, user]);

  const openInbox = useCallback(() => {
    setOpen(true);
    setThreads((current) => current.map((row) => ({ ...row, unread: false })));
  }, []);

  const closeInbox = useCallback(() => setOpen(false), []);

  const startDraft = useCallback(() => {
    setDraft(true);
    if (prefs.inboxSound) playInboxChime();
  }, [prefs.inboxSound]);

  const value = useMemo(
    () => ({ open, draft, toast, threads, unread, openInbox, closeInbox, startDraft }),
    [open, draft, toast, threads, unread, openInbox, closeInbox, startDraft],
  );

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used inside InboxProvider");
  return ctx;
}
