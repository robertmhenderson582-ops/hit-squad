"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { playInboxChime, unlockInboxAudio } from "@/lib/chime";
import {
  contactsFor,
  makeThread,
  previewOf,
  unreadCount,
  type InboxPerson,
  type InboxThread,
} from "@/lib/inbox";
import { applyWhatsNew, DESK_PERSON_ID } from "@/lib/whats-new";
import { useDisplay } from "@/components/DisplayProvider";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { buildDeskChrome, isTester } from "@/lib/desk-role";

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

function attachDesk(server: InboxThread[], current: InboxThread[], seat: string, ownerChrome: boolean) {
  const next = applyWhatsNew(server, seat, ownerChrome);
  if (next.some((thread) => thread.personId === DESK_PERSON_ID)) return next;
  const desk = current.find((thread) => thread.personId === DESK_PERSON_ID);
  return desk ? [desk, ...server] : server;
}

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession();
  const desk = useOwnerDesk();
  const { prefs } = useDisplay();
  const ownerChrome = buildDeskChrome(user, desk?.viewAs);
  const seat = isTester(user)
    ? user?.email || user?.id || "tester"
    : ownerChrome
      ? user?.id || "owner"
      : desk?.viewAs && desk.viewAs !== "owner"
        ? desk.viewAs
        : user?.id || user?.email || "tester";

  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [contacts, setContacts] = useState<InboxPerson[]>(() => contactsFor(ownerChrome));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const applyServer = useCallback(
    (server: InboxThread[]) => {
      setThreads((current) => {
        const next = attachDesk(server, current, seat, ownerChrome);
        setActiveId((active) => {
          if (!active) return active;
          if (next.some((thread) => thread.id === active)) return active;
          const old = current.find((thread) => thread.id === active);
          return old ? next.find((thread) => thread.personId === old.personId)?.id ?? null : null;
        });
        return next;
      });
    },
    [ownerChrome, seat],
  );

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !user) return [];
    const response = await fetch("/api/desk/inbox", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    const server = Array.isArray(data.threads) ? (data.threads as InboxThread[]) : [];
    if (Array.isArray(data.contacts)) setContacts(data.contacts as InboxPerson[]);
    applyServer(server);
    setReady(true);
    return server;
  }, [applyServer, status, user]);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      setThreads([]);
      setReady(false);
      return;
    }
    setActiveId(null);
    setSelectedIds([]);
    setComposing(false);
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh, status, user]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/desk/inbox", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      const server = Array.isArray(data.threads) ? (data.threads as InboxThread[]) : [];
      if (Array.isArray(data.contacts)) setContacts(data.contacts as InboxPerson[]);
      applyServer(server);
      return server;
    },
    [applyServer],
  );

  const unread = unreadCount(threads);

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

  const openInbox = useCallback(() => {
    unlockInboxAudio();
    setOpen(true);
    void refresh();
  }, [refresh]);

  const closeInbox = useCallback(() => {
    setOpen(false);
    setComposing(false);
  }, []);

  const startDraft = useCallback(() => {
    unlockInboxAudio();
    if (!ownerChrome) {
      const owner = contacts[0] || contactsFor(false)[0];
      setThreads((current) => {
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
  }, [contacts, ownerChrome]);

  const startThread = useCallback((person: InboxPerson) => {
    setThreads((current) => {
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
  }, []);

  const openThread = useCallback(
    (id: string) => {
      setActiveId(id);
      setComposing(false);
      void post({ action: "read", threadId: id });
    },
    [post],
  );

  const sendMessage = useCallback(
    (text: string, photo?: string | null) => {
      const active = threads.find((thread) => thread.id === activeId);
      if (!active) return;
      const trimmed = text.trim();
      if (!trimmed && !photo) return;
      void post({ action: "send", to: active.personId, text: trimmed, photo });
    },
    [activeId, post, threads],
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
      deleteMessage: (threadId, messageId) => {
        void post({ action: "deleteMessage", threadId, messageId });
      },
      clearConversation: (threadId) => {
        void post({ action: "clear", threadId });
      },
      toggleSelect: (id) =>
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])),
      selectAll: () => setSelectedIds(threads.map((thread) => thread.id)),
      clearSelect: () => setSelectedIds([]),
      deleteSelected: () => {
        for (const id of selectedIds) void post({ action: "clear", threadId: id });
        setSelectedIds([]);
        setActiveId((current) => (current && selectedIds.includes(current) ? null : current));
      },
      emptyInbox: () => {
        void post({ action: "empty" });
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
      post,
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
