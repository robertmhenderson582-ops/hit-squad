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
import { canReceiveDeskBot, canUseInbox } from "@/lib/inbox-circle";
import { applyWhatsNew, DESK_PERSON_ID } from "@/lib/whats-new";
import { useDisplay } from "@/components/DisplayProvider";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { buildDeskChrome, isTester } from "@/lib/desk-role";
import { deskFetch } from "@/lib/estimate-vault-client";

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

function mergeDesk(local: InboxThread[], remote: InboxThread[]) {
  const desk = local.filter((thread) => thread.personId === DESK_PERSON_ID);
  const peers = remote.filter((thread) => thread.personId !== DESK_PERSON_ID);
  return [...desk, ...peers];
}

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const desk = useOwnerDesk();
  const lens = useLensUser();
  const { prefs } = useDisplay();
  const ownerChrome = buildDeskChrome(user, desk?.viewAs, desk?.followSeat);
  const watched = desk?.followSeat && desk.followSeat !== "owner" ? desk.followSeat : undefined;
  const viewed = desk?.viewAs && desk.viewAs !== "owner" ? desk.viewAs : undefined;
  const seat = isTester(user)
    ? user?.email || user?.id || "tester"
    : ownerChrome
    ? user?.id || "owner"
    : watched || viewed || user?.id || user?.email || "tester";
  const inboxEmail = lens?.email || user?.email || "";
  const inboxOn = canUseInbox({ email: inboxEmail });

  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const loadRemote = useCallback(async () => {
    if (!inboxOn) return [] as InboxThread[];
    const response = await deskFetch("/api/desk/inbox");
    if (!response.ok) return [];
    const data = (await response.json().catch(() => ({}))) as { threads?: InboxThread[] };
    return Array.isArray(data.threads) ? data.threads : [];
  }, [inboxOn]);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      setThreads([]);
      setReady(false);
      return;
    }
    const local = canReceiveDeskBot({ email: inboxEmail })
      ? applyWhatsNew(readThreads(seat, ownerChrome), seat, ownerChrome, inboxEmail)
      : readThreads(seat, ownerChrome).filter((thread) => thread.personId !== DESK_PERSON_ID);
    setThreads(local);
    setActiveId(null);
    setSelectedIds([]);
    setComposing(false);
    setReady(true);
    if (!inboxOn) return;
    void loadRemote().then((remote) => {
      setThreads((current) => mergeDesk(current, remote));
    });
  }, [inboxEmail, inboxOn, loadRemote, ownerChrome, seat, status, user]);

  useEffect(() => {
    if (!ready || !inboxOn) return;
    const id = window.setInterval(() => {
      void loadRemote().then((remote) => {
        setThreads((current) => mergeDesk(current, remote));
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [inboxOn, loadRemote, ready]);

  useEffect(() => {
    if (!ready || status !== "authenticated" || !user) return;
    writeThreads(seat, threads);
  }, [ready, seat, status, threads, user]);

  const unread = unreadCount(threads);
  const contacts = useMemo(() => contactsFor(ownerChrome, inboxEmail), [inboxEmail, ownerChrome]);

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
    if (!inboxOn) return;
    unlockInboxAudio();
    setOpen(true);
  }, [inboxOn]);

  const closeInbox = useCallback(() => {
    setOpen(false);
    setComposing(false);
  }, []);

  const startDraft = useCallback(() => {
    if (!inboxOn) return;
    unlockInboxAudio();
    setComposing(true);
    setActiveId(null);
    setOpen(true);
  }, [inboxOn]);

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
        if (thread.personId !== DESK_PERSON_ID && inboxOn) {
          void deskFetch("/api/desk/inbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ readPersonId: thread.personId }),
          }).then((response) => {
            if (!response.ok) return;
            return response.json() as Promise<{ threads?: InboxThread[] }>;
          }).then((data) => {
            if (!data?.threads) return;
            setThreads((existing) => mergeDesk(existing, data.threads ?? []));
          });
        }
        return {
          ...thread,
          unread: 0,
          messages: thread.messages.map((message) =>
            message.from === "self" && !message.readAt ? { ...message, readAt: new Date().toLocaleString("en-GB", { hour12: false }) } : message,
          ),
        };
      }),
    );
  }, [inboxOn, persist]);

  const sendMessage = useCallback(
    (text: string, photo?: string | null) => {
      if (!activeId) return;
      const trimmed = text.trim();
      if (!trimmed && !photo) return;
      const active = threads.find((thread) => thread.id === activeId);
      persist((current) =>
        current.map((thread) =>
          thread.id === activeId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  makeMessage({
                    from: "self",
                    author: lens?.name || user?.name || "You",
                    text: trimmed,
                    photo,
                  }),
                ],
              }
            : thread,
        ),
      );
      if (active && active.personId !== DESK_PERSON_ID && inboxOn) {
        void deskFetch("/api/desk/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: active.personId, text: trimmed, photo: photo ?? null }),
        }).then((response) => {
          if (!response.ok) return;
          return response.json() as Promise<{ threads?: InboxThread[] }>;
        }).then((data) => {
          if (!data?.threads) return;
          setThreads((current) => mergeDesk(current, data.threads ?? []));
        });
      }
    },
    [activeId, inboxOn, lens?.name, persist, threads, user?.name],
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
        persist((current) => current.filter((thread) => thread.personId === DESK_PERSON_ID));
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
