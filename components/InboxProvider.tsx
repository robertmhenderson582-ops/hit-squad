"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { playInboxChime, unlockInboxAudio } from "@/lib/chime";
import {
  contactsFor,
  makeMessage,
  makeThread,
  previewOf,
  readThreads,
  unreadCount,
  writeThreads,
  type InboxPerson,
  type InboxThread,
} from "@/lib/inbox";
import { applyWhatsNew } from "@/lib/whats-new";
import { useDisplay } from "@/components/DisplayProvider";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { buildDeskChrome } from "@/lib/desk-role";

type InboxState = {
  open: boolean;
  composing: boolean;
  toast: string | null;
  threads: InboxThread[];
  unread: number;
  activeId: string | null;
  selectedIds: string[];
  contacts: InboxPerson[];
  ownerChrome: boolean;
  previewOf: (thread: InboxThread) => string;
  openInbox: () => void;
  closeInbox: () => void;
  startDraft: () => void;
  cancelDraft: () => void;
  startThread: (person: InboxPerson) => void;
  openThread: (id: string) => void;
  closeThread: () => void;
  sendMessage: (text: string, photo?: string | null) => void;
  deleteMessage: (threadId: string, messageId: string) => void;
  clearConversation: (threadId: string) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelect: () => void;
  deleteSelected: () => void;
  emptyInbox: () => void;
};

const InboxContext = createContext<InboxState | null>(null);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const desk = useOwnerDesk();
  const { prefs } = useDisplay();
  const ownerChrome = buildDeskChrome(user, desk?.viewAs);
  const seat = ownerChrome
    ? user?.id || "owner"
    : desk?.viewAs && desk.viewAs !== "owner"
      ? desk.viewAs
      : user?.id || user?.email || "tester";

  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      setThreads([]);
      setReady(false);
      return;
    }
    setThreads(applyWhatsNew(readThreads(seat, ownerChrome), seat, ownerChrome));
    setActiveId(null);
    setSelectedIds([]);
    setComposing(false);
    setReady(true);
  }, [ownerChrome, seat, status, user]);

  useEffect(() => {
    if (!ready || status !== "authenticated" || !user) return;
    writeThreads(seat, threads);
  }, [ready, seat, status, threads, user]);

  const unread = unreadCount(threads);
  const contacts = useMemo(() => contactsFor(ownerChrome), [ownerChrome]);

  const announce = useCallback(
    (preview: string) => {
      setToast(preview);
      if (prefs.inboxSound) playInboxChime();
      window.setTimeout(() => setToast(null), 4200);
    },
    [prefs.inboxSound],
  );

  useEffect(() => {
    if (!ready) return;
    if (sessionStorage.getItem(`hs_inbox_announced:${seat}`)) return;
    if (unread === 0) return;
    sessionStorage.setItem(`hs_inbox_announced:${seat}`, "1");
    announce("New inbox message");
  }, [announce, ready, seat, unread]);

  const persist = useCallback((next: InboxThread[] | ((current: InboxThread[]) => InboxThread[])) => {
    setThreads((current) => (typeof next === "function" ? next(current) : next));
  }, []);

  const openInbox = useCallback(() => {
    unlockInboxAudio();
    setOpen(true);
  }, []);

  const closeInbox = useCallback(() => {
    setOpen(false);
    setComposing(false);
  }, []);

  const startDraft = useCallback(() => {
    unlockInboxAudio();
    if (!ownerChrome) {
      const owner = contacts[0];
      persist((current) => {
        const existing = current.find((thread) => thread.personId === owner.id);
        if (existing) {
          setActiveId(existing.id);
          return current;
        }
        const created = makeThread(owner);
        setActiveId(created.id);
        return [created, ...current];
      });
      setComposing(false);
      setOpen(true);
      return;
    }
    setComposing(true);
    setActiveId(null);
    setOpen(true);
  }, [contacts, ownerChrome, persist]);

  const startThread = useCallback(
    (person: InboxPerson) => {
      persist((current) => {
        const existing = current.find((thread) => thread.personId === person.id);
        if (existing) {
          setActiveId(existing.id);
          return current;
        }
        const created = makeThread(person);
        setActiveId(created.id);
        return [created, ...current];
      });
      setComposing(false);
    },
    [persist],
  );

  const openThread = useCallback((id: string) => {
    setActiveId(id);
    setComposing(false);
    persist((current) =>
      current.map((thread) => {
        if (thread.id !== id) return thread;
        return {
          ...thread,
          unread: 0,
          messages: thread.messages.map((message) =>
            message.from === "self" && !message.readAt ? { ...message, readAt: new Date().toLocaleString("en-GB", { hour12: false }) } : message,
          ),
        };
      }),
    );
  }, [persist]);

  const sendMessage = useCallback(
    (text: string, photo?: string | null) => {
      if (!activeId) return;
      const trimmed = text.trim();
      if (!trimmed && !photo) return;
      persist((current) =>
        current.map((thread) =>
          thread.id === activeId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  makeMessage({
                    from: "self",
                    author: user?.name || "You",
                    text: trimmed,
                    photo,
                  }),
                ],
              }
            : thread,
        ),
      );
    },
    [activeId, persist, user?.name],
  );

  const value = useMemo<InboxState>(
    () => ({
      open,
      composing,
      toast,
      threads,
      unread,
      activeId,
      selectedIds,
      contacts,
      ownerChrome,
      previewOf,
      openInbox,
      closeInbox,
      startDraft,
      cancelDraft: () => setComposing(false),
      startThread,
      openThread,
      closeThread: () => setActiveId(null),
      sendMessage,
      deleteMessage: (threadId, messageId) =>
        persist((current) =>
          current.map((thread) =>
            thread.id === threadId
              ? { ...thread, messages: thread.messages.filter((message) => message.id !== messageId) }
              : thread,
          ),
        ),
      clearConversation: (threadId) =>
        persist((current) =>
          current.map((thread) => (thread.id === threadId ? { ...thread, messages: [], unread: 0 } : thread)),
        ),
      toggleSelect: (id) =>
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])),
      selectAll: () => setSelectedIds(threads.map((thread) => thread.id)),
      clearSelect: () => setSelectedIds([]),
      deleteSelected: () => {
        persist((current) => current.filter((thread) => !selectedIds.includes(thread.id)));
        setSelectedIds([]);
        setActiveId((current) => (current && selectedIds.includes(current) ? null : current));
      },
      emptyInbox: () => {
        persist([]);
        setSelectedIds([]);
        setActiveId(null);
      },
    }),
    [
      activeId,
      closeInbox,
      composing,
      contacts,
      open,
      openInbox,
      openThread,
      ownerChrome,
      persist,
      selectedIds,
      sendMessage,
      startDraft,
      startThread,
      threads,
      toast,
      unread,
    ],
  );

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used inside InboxProvider");
  return ctx;
}
