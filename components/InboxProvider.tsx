"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { playInboxChime, unlockInboxAudio } from "@/lib/chime";
import {
  appendInboxMessage,
  contactsFor,
  omitHiddenPersonThreads,
  previewOf,
  readInboxHides,
  readThreads,
  reconcileInboxDesk,
  rollbackInboxSend,
  startInboxThread,
  unreadCount,
  writeInboxHides,
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
  const activeIdRef = useRef<string | null>(null);
  const threadsRef = useRef<InboxThread[]>([]);
  const hiddenMessageIdsRef = useRef(new Set<string>());
  const hiddenPersonIdsRef = useRef(new Set<string>());
  const identityRef = useRef<string | null>(null);
  const identityKey = `${inboxEmail}|${ownerChrome}|${seat}|${user?.email ?? ""}`;
  activeIdRef.current = activeId;
  threadsRef.current = threads;

  const applyRemote = useCallback((remote: InboxThread[]) => {
    setThreads((current) => {
      const next = reconcileInboxDesk(current, remote, activeIdRef.current, {
        hiddenMessageIds: hiddenMessageIdsRef.current,
        hiddenPersonIds: hiddenPersonIdsRef.current,
      });
      threadsRef.current = next.threads;
      if (next.activeId !== activeIdRef.current) {
        activeIdRef.current = next.activeId;
        setActiveId(next.activeId);
      }
      return next.threads;
    });
  }, []);

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
      identityRef.current = null;
      return;
    }
    const identityChanged = identityRef.current !== identityKey;
    identityRef.current = identityKey;
    if (identityChanged) {
      const hides = readInboxHides(seat);
      hiddenMessageIdsRef.current = new Set(hides.messageIds);
      hiddenPersonIdsRef.current = new Set(hides.personIds);
      const stored = omitHiddenPersonThreads(readThreads(seat, ownerChrome), hides.personIds);
      const local = canReceiveDeskBot({ email: inboxEmail })
        ? applyWhatsNew(stored, seat, ownerChrome, inboxEmail)
        : stored.filter((thread) => thread.personId !== DESK_PERSON_ID);
      setThreads(local);
      setActiveId(null);
      setSelectedIds([]);
      setComposing(false);
    }
    setReady(true);
    if (!inboxOn) return;
    void loadRemote().then((remote) => {
      applyRemote(remote);
    });
  }, [applyRemote, identityKey, inboxEmail, inboxOn, loadRemote, ownerChrome, seat, status, user]);

  useEffect(() => {
    if (!ready || !inboxOn) return;
    const id = window.setInterval(() => {
      void loadRemote().then((remote) => {
        applyRemote(remote);
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [applyRemote, inboxOn, loadRemote, ready]);

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
    setThreads((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      threadsRef.current = resolved;
      return resolved;
    });
  }, []);

  const persistHides = useCallback(() => {
    writeInboxHides(seat, {
      personIds: [...hiddenPersonIdsRef.current],
      messageIds: [...hiddenMessageIdsRef.current],
    });
  }, [seat]);

  const flashToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const postInboxHide = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await deskFetch("/api/desk/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("hide-failed");
      const data = (await response.json().catch(() => ({}))) as { threads?: InboxThread[] };
      if (!Array.isArray(data.threads)) throw new Error("hide-failed");
      applyRemote(data.threads);
    },
    [applyRemote],
  );

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
        const next = startInboxThread(current, person, {
          hiddenPersonIds: hiddenPersonIdsRef.current,
          hiddenMessageIds: hiddenMessageIdsRef.current,
        });
        activeIdRef.current = next.activeId;
        setActiveId(next.activeId);
        return next.threads;
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
            applyRemote(data.threads ?? []);
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
  }, [applyRemote, inboxOn, persist]);

  const sendMessage = useCallback(
    (text: string, photo?: string | null) => {
      const threadId = activeIdRef.current;
      if (!threadId) return;
      const trimmed = text.trim();
      if (!trimmed && !photo) return;
      const active = threadsRef.current.find((thread) => thread.id === threadId);
      if (!active) return;
      const pending = makeMessage({
        from: "self",
        author: lens?.name || user?.name || "You",
        text: trimmed,
        photo,
      });
      persist((current) => appendInboxMessage(current, threadId, pending));
      if (active.personId === DESK_PERSON_ID || !inboxOn) return;
      void deskFetch("/api/desk/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: active.personId, text: trimmed, photo: photo ?? null }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("send-failed");
          const data = (await response.json().catch(() => ({}))) as { threads?: InboxThread[] };
          if (!Array.isArray(data.threads)) throw new Error("send-failed");
          applyRemote(data.threads);
          hiddenPersonIdsRef.current.delete(active.personId);
          persistHides();
        })
        .catch(() => {
          persist((current) => rollbackInboxSend(current, threadId, pending.id));
          flashToast("Message did not send. Try again.");
        });
    },
    [applyRemote, flashToast, inboxOn, lens?.name, persist, persistHides, user?.name],
  );

  const deleteMessage = useCallback(
    (threadId: string, messageId: string) => {
      hiddenMessageIdsRef.current.add(messageId);
      persist((current) => rollbackInboxSend(current, threadId, messageId));
      persistHides();
      const thread = threadsRef.current.find((row) => row.id === threadId);
      if (!thread || thread.personId === DESK_PERSON_ID || !inboxOn) return;
      void postInboxHide({ hideMessageId: messageId }).catch(() => {
        hiddenMessageIdsRef.current.delete(messageId);
        persistHides();
        flashToast("Could not delete. Try again.");
        void loadRemote().then(applyRemote);
      });
    },
    [applyRemote, flashToast, inboxOn, loadRemote, persist, persistHides, postInboxHide],
  );

  const clearConversation = useCallback(
    (threadId: string) => {
      const thread = threadsRef.current.find((row) => row.id === threadId);
      if (thread) {
        for (const message of thread.messages) hiddenMessageIdsRef.current.add(message.id);
        if (thread.personId !== DESK_PERSON_ID) hiddenPersonIdsRef.current.add(thread.personId);
      }
      persist((current) =>
        current.map((row) => (row.id === threadId ? { ...row, messages: [], unread: 0 } : row)),
      );
      persistHides();
      if (!thread || thread.personId === DESK_PERSON_ID || !inboxOn) return;
      void postInboxHide({ hidePersonId: thread.personId }).catch(() => {
        hiddenPersonIdsRef.current.delete(thread.personId);
        for (const message of thread.messages) hiddenMessageIdsRef.current.delete(message.id);
        persistHides();
        flashToast("Could not delete. Try again.");
        void loadRemote().then(applyRemote);
      });
    },
    [applyRemote, flashToast, inboxOn, loadRemote, persist, persistHides, postInboxHide],
  );

  const deleteSelected = useCallback(() => {
    const ids = selectedIds;
    const selected = threadsRef.current.filter((thread) => ids.includes(thread.id));
    const personIds = selected
      .filter((thread) => thread.personId !== DESK_PERSON_ID)
      .map((thread) => thread.personId);
    for (const thread of selected) {
      for (const message of thread.messages) hiddenMessageIdsRef.current.add(message.id);
      if (thread.personId !== DESK_PERSON_ID) hiddenPersonIdsRef.current.add(thread.personId);
    }
    persist((current) => current.filter((thread) => !ids.includes(thread.id)));
    persistHides();
    setSelectedIds([]);
    setActiveId((current) => (current && ids.includes(current) ? null : current));
    if (!inboxOn || !personIds.length) return;
    void postInboxHide({ hidePersonIds: personIds }).catch(() => {
      for (const id of personIds) hiddenPersonIdsRef.current.delete(id);
      for (const thread of selected) {
        for (const message of thread.messages) hiddenMessageIdsRef.current.delete(message.id);
      }
      persistHides();
      flashToast("Could not delete. Try again.");
      void loadRemote().then(applyRemote);
    });
  }, [applyRemote, flashToast, inboxOn, loadRemote, persist, persistHides, postInboxHide, selectedIds]);

  const emptyInbox = useCallback(() => {
    const peers = threadsRef.current.filter((thread) => thread.personId !== DESK_PERSON_ID);
    for (const thread of peers) {
      for (const message of thread.messages) hiddenMessageIdsRef.current.add(message.id);
      hiddenPersonIdsRef.current.add(thread.personId);
    }
    persist((current) => current.filter((thread) => thread.personId === DESK_PERSON_ID));
    persistHides();
    setSelectedIds([]);
    setActiveId(null);
    if (!inboxOn) return;
    void postInboxHide({ emptyInbox: true }).catch(() => {
      for (const thread of peers) {
        hiddenPersonIdsRef.current.delete(thread.personId);
        for (const message of thread.messages) hiddenMessageIdsRef.current.delete(message.id);
      }
      persistHides();
      flashToast("Could not delete. Try again.");
      void loadRemote().then(applyRemote);
    });
  }, [applyRemote, flashToast, inboxOn, loadRemote, persist, persistHides, postInboxHide]);

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
      deleteMessage,
      clearConversation,
      toggleSelect: (id) =>
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])),
      selectAll: () => setSelectedIds(threads.map((thread) => thread.id)),
      clearSelect: () => setSelectedIds([]),
      deleteSelected,
      emptyInbox,
    }),
    [
      activeId,
      clearConversation,
      closeInbox,
      composing,
      contacts,
      deleteMessage,
      deleteSelected,
      emptyInbox,
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
